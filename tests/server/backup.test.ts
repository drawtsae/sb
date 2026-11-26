// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";
import { createSession } from "@/server/auth/session";
import { createUser } from "@/server/repo/users";
import { events } from "@/server/db/schema";
import { backupDatabase } from "@/server/db/backup";
import { GET } from "@/app/api/admin/backup/route";

let root: string;
let adminCookie: string;
let userCookie: string;

const leftovers = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("sb-backup-"));

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-bk-"));
});
afterAll(() => {
  resetDbForTests();
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(async () => {
  resetDbForTests();
  process.env.DATA_DIR = fs.mkdtempSync(path.join(root, "d-"));
  const db = getDb();
  const admin = await createUser(db, "a@x.com", "pw123456", true);
  const user = await createUser(db, "u@x.com", "pw123456", false);
  adminCookie = `sb_session=${(await createSession(db, admin.id)).token}`;
  userCookie = `sb_session=${(await createSession(db, user.id)).token}`;
  db.insert(events).values({ name: "E1" }).run();
  db.insert(events).values({ name: "E2" }).run();
});

const req = (cookie?: string) =>
  new Request("http://t/api/admin/backup", { headers: cookie ? { cookie } : {} });

function counts(file: string) {
  const s = new Database(file, { readonly: true });
  try {
    const n = (t: string) => (s.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
    return { users: n("users"), events: n("events") };
  } finally {
    s.close();
  }
}

describe("backupDatabase", () => {
  it("backup file opens and contains same row counts", () => {
    const dest = path.join(root, "copy.db");
    backupDatabase(getDb(), dest);
    expect(counts(dest)).toEqual({ users: 2, events: 2 });
  });
  it("throws a clear error when the destination exists", () => {
    const dest = path.join(root, "exists.db");
    fs.writeFileSync(dest, "x");
    expect(() => backupDatabase(getDb(), dest)).toThrow(/already exists/);
  });
});

describe("GET /api/admin/backup", () => {
  it("401 without session", async () => {
    expect((await GET(req())).status).toBe(401);
  });
  it("non-admin gets 403", async () => {
    expect((await GET(req(userCookie))).status).toBe(403);
  });
  it("streams a valid sqlite backup and removes the temp file", async () => {
    const before = leftovers();
    const r = await GET(req(adminCookie));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/vnd.sqlite3");
    expect(r.headers.get("content-disposition")).toMatch(
      /^attachment; filename="soundboard-\d{4}-\d{2}-\d{2}-\d{4}\.db"$/,
    );
    const out = path.join(root, "download.db");
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    expect(counts(out)).toEqual({ users: 2, events: 2 });
    await new Promise((res) => setTimeout(res, 50));
    expect(leftovers()).toEqual(before);
  });
});
