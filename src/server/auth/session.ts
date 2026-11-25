import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

export type User = { id: string; email: string; isAdmin: boolean };

export const SESSION_COOKIE = "sb_session";
const DAY = 86_400_000;
export const SESSION_TTL_MS = 30 * DAY;
const SLIDE_THRESHOLD_MS = 15 * DAY;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: expiresAt.toISOString() })
    .run();
  return { token, expiresAt };
}

export async function validateSession(db: Db, token: string): Promise<{ user: User } | null> {
  if (!token) return null;
  const id = hashToken(token);
  const row = db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;
  const remaining = new Date(row.expiresAt).getTime() - Date.now();
  if (!(remaining > 0)) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  if (remaining < SLIDE_THRESHOLD_MS) {
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
      .where(eq(sessions.id, id))
      .run();
  }
  return { user: { id: row.id, email: row.email, isAdmin: row.isAdmin } };
}

export async function invalidateSession(db: Db, token: string): Promise<void> {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

/** Cookie attributes. The DB row is the authority on expiry, so the cookie outlives it. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: 365 * 86_400,
  };
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
