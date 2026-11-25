import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/server/db/client";
import { readCookie, SESSION_COOKIE, validateSession, type User } from "./session";

/** Pages and server actions. Redirects to /login when there is no valid session. */
export async function requireUser(next?: string): Promise<User> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await validateSession(getDb(), token) : null;
  if (!session) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return session.user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/events");
  return user;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Route handlers. Returns the user, or a 401 Response to return as-is. */
export async function requireUserApi(req: Request, db: Db = getDb()): Promise<User | Response> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const session = token ? await validateSession(db, token) : null;
  return session ? session.user : fail(401, "unauthorized");
}

export async function requireAdminApi(req: Request, db: Db = getDb()): Promise<User | Response> {
  const r = await requireUserApi(req, db);
  if (r instanceof Response) return r;
  return r.isAdmin ? r : fail(403, "forbidden");
}
