import { eq } from "drizzle-orm";
import { hashPassword } from "@/server/auth/password";
import type { User } from "@/server/auth/session";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

export type UserListItem = User & { createdAt: string };

export async function createUser(
  db: Db,
  email: string,
  password: string,
  isAdmin: boolean,
): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  return db
    .insert(users)
    .values({ email: normalized, passwordHash, isAdmin })
    .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .get();
}

export function findUserByEmail(db: Db, email: string) {
  return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
}

/** Sets a new password and signs the user out everywhere. */
export async function resetPassword(db: Db, userId: string, pw: string): Promise<void> {
  const passwordHash = await hashPassword(pw);
  db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function deleteUser(db: Db, userId: string): void {
  db.delete(users).where(eq(users.id, userId)).run(); // sessions cascade
}

/** Never includes password hashes. */
export function listUsers(db: Db): UserListItem[] {
  return db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
    .all();
}
