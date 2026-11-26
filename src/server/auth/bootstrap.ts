import { count } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createUser } from "@/server/repo/users";
import { passwordProblem } from "./password";

export async function ensureAdminFromEnv(db: Db): Promise<void> {
  const total = db.select({ n: count() }).from(users).get()?.n ?? 0;
  if (total > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      "[auth] No users exist and ADMIN_EMAIL / ADMIN_PASSWORD are not set; nobody can sign in. " +
        "Set them or run: npm run user -- --email x --password y --admin",
    );
    return;
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(
      `[auth] Refusing to create the admin user: ADMIN_PASSWORD ${problem}. ` +
        "Set a long random ADMIN_PASSWORD and restart.",
    );
    return;
  }
  await createUser(db, email, password, true);
  console.log(`[auth] Created admin user ${email.toLowerCase()}`);
}
