// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, invalidateSession, validateSession } from "@/server/auth/session";
import {
  checkLoginRate,
  reserveLoginAttempt,
  recordLoginFailure,
  resetLoginRate,
  resetRateLimitForTests,
} from "@/server/auth/rate-limit";
import { ensureAdminFromEnv } from "@/server/auth/bootstrap";
import { createUser, deleteUser, listUsers, resetPassword } from "@/server/repo/users";
import { requireAdminApi, requireUserApi } from "@/server/auth/require";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let db: Db;
beforeEach(() => {
  db = createTestDb();
  resetRateLimitForTests();
});

describe("password", () => {
  it("verifyPassword true for correct, false for wrong", async () => {
    const h = await hashPassword("hunter2hunter2");
    expect(h).toContain("$argon2id$");
    expect(await verifyPassword(h, "hunter2hunter2")).toBe(true);
    expect(await verifyPassword(h, "nope")).toBe(false);
  });
});

describe("sessions", () => {
  it("validateSession returns user for fresh token", async () => {
    const u = await createUser(db, "A@x.com", "pw123456", true);
    const { token } = await createSession(db, u.id);
    const r = await validateSession(db, token);
    expect(r?.user).toEqual({ id: u.id, email: "a@x.com", isAdmin: true });
  });

  it("returns null and deletes row when expired", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    const { token } = await createSession(db, u.id);
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.id, sha(token)))
      .run();
    expect(await validateSession(db, token)).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("stored session id is not the raw token", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    const { token } = await createSession(db, u.id);
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].id).toBe(sha(token));
  });

  it("slides expiry when under 15 days remain", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    const { token } = await createSession(db, u.id);
    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    db.update(sessions).set({ expiresAt: soon }).run();
    await validateSession(db, token);
    const exp = new Date(db.select().from(sessions).get()!.expiresAt).getTime();
    expect(exp - Date.now()).toBeGreaterThan(29 * 86400_000);
  });

  it("unknown token is null; invalidateSession removes", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    expect(await validateSession(db, "bogus")).toBeNull();
    const { token } = await createSession(db, u.id);
    await invalidateSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });
});

describe("rate limit", () => {
  it("checkLoginRate blocks the 6th failure within 15 min and reports retryAfterSec > 0", () => {
    const key = "a@x.com|local";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRate(key, t0 + i).allowed).toBe(true);
      recordLoginFailure(key, t0 + i);
    }
    const r = checkLoginRate(key, t0 + 10);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(checkLoginRate(key, t0 + 15 * 60_000 + 10).allowed).toBe(true);
  });

  it("concurrent wrong-password attempts are throttled from the 6th", async () => {
    const key = "a@x.com|local";
    const h = await hashPassword("right-password");
    // Mirrors the login action: reserve synchronously, then await slow verification.
    const attempt = async () => {
      const r = reserveLoginAttempt(key);
      if (!r.allowed) return "throttled";
      await verifyPassword(h, "wrong");
      return "failed";
    };
    const results = await Promise.all(Array.from({ length: 8 }, attempt));
    expect(results.filter((r) => r === "failed")).toHaveLength(5);
    expect(results.slice(5)).toEqual(["throttled", "throttled", "throttled"]);
    resetLoginRate(key);
    expect(checkLoginRate(key).allowed).toBe(true);
  });

  it("success resets the counter", () => {
    const key = "a@x.com|local";
    for (let i = 0; i < 4; i++) recordLoginFailure(key, 1000);
    resetLoginRate(key);
    recordLoginFailure(key, 1000);
    expect(checkLoginRate(key, 1001).allowed).toBe(true);
  });
});

describe("ensureAdminFromEnv", () => {
  it("creates admin only when users empty", async () => {
    vi.stubEnv("ADMIN_EMAIL", "Boss@X.com");
    vi.stubEnv("ADMIN_PASSWORD", "supersecret1");
    await ensureAdminFromEnv(db);
    let all = listUsers(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ email: "boss@x.com", isAdmin: true });
    vi.stubEnv("ADMIN_EMAIL", "other@x.com");
    await ensureAdminFromEnv(db);
    all = listUsers(db);
    expect(all).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it.each([
    ["the .env.production.example placeholder", "change-me-to-a-long-random-password"],
    ["the .env.example placeholder", "change-me"],
    ["a password containing change-me", "Xchange-me123456"],
    ["a short password", "abc1234"],
  ])("refuses %s and logs an error", async (_label, password) => {
    vi.stubEnv("ADMIN_EMAIL", "boss@x.com");
    vi.stubEnv("ADMIN_PASSWORD", password);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await ensureAdminFromEnv(db);
    expect(listUsers(db)).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("ADMIN_PASSWORD");
    error.mockRestore();
    vi.unstubAllEnvs();
  });

  it("accepts a good password of 8+ characters", async () => {
    vi.stubEnv("ADMIN_EMAIL", "boss@x.com");
    vi.stubEnv("ADMIN_PASSWORD", "k9-Tq2vLmx");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await ensureAdminFromEnv(db);
    expect(listUsers(db)).toHaveLength(1);
    log.mockRestore();
    vi.unstubAllEnvs();
  });

  it("does nothing and warns when env unset", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await ensureAdminFromEnv(db);
    expect(listUsers(db)).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("create-user script", () => {
  it("refuses a password shorter than 8 characters", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-cu-"));
    try {
      const r = spawnSync(
        process.execPath,
        [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/create-user.ts", "--email", "a@x.com", "--password", "short7!"],
        { env: { ...process.env, DATA_DIR: dir }, encoding: "utf8" },
      );
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("at least 8 characters");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("user repo", () => {
  it("list never exposes hashes; reset and delete work", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    expect(JSON.stringify(listUsers(db))).not.toContain("argon2");
    await resetPassword(db, u.id, "newpass123");
    const row = db.select().from(users).get()!;
    expect(await verifyPassword(row.passwordHash, "newpass123")).toBe(true);
    await createSession(db, u.id);
    deleteUser(db, u.id);
    expect(listUsers(db)).toHaveLength(0);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("resetPassword invalidates existing sessions", async () => {
    const u = await createUser(db, "a@x.com", "pw123456", false);
    const { token } = await createSession(db, u.id);
    await resetPassword(db, u.id, "newpass123");
    expect(await validateSession(db, token)).toBeNull();
  });
});

describe("api guards", () => {
  it("401 without cookie, user with cookie, 403 for non-admin", async () => {
    const r = await requireUserApi(new Request("http://x/api/a"), db);
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(401);
    const u = await createUser(db, "a@x.com", "pw123456", false);
    const { token } = await createSession(db, u.id);
    const req = new Request("http://x/api/a", {
      headers: { cookie: `foo=1; sb_session=${token}` },
    });
    expect(await requireUserApi(req, db)).toMatchObject({ email: "a@x.com" });
    const a = await requireAdminApi(req, db);
    expect((a as Response).status).toBe(403);
  });
});
