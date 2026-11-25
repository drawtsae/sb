"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  loginRateKey,
  reserveLoginAttempt,
  resetLoginRate,
} from "@/server/auth/rate-limit";
import {
  createSession,
  invalidateSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { findUserByEmail } from "@/server/repo/users";

export type LoginState = { error?: string };

let dummyHash: Promise<string> | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const key = loginRateKey(email, await headers());
  // Reserved synchronously (before any await) so parallel guesses are all counted.
  const rate = reserveLoginAttempt(key);
  if (!rate.allowed) return { error: `Thử lại sau ${rate.retryAfterSec} giây` };

  const db = getDb();
  const user = email ? findUserByEmail(db, email) : undefined;
  // Verify against a dummy hash for unknown emails so timing doesn't reveal them.
  const hash = user?.passwordHash ?? (await (dummyHash ??= hashPassword("dummy-password")));
  const ok = (await verifyPassword(hash, password)) && !!user;
  if (!ok || !user) {
    return { error: "Sai email hoặc mật khẩu" };
  }

  resetLoginRate(key);
  const jar = await cookies();
  const old = jar.get(SESSION_COOKIE)?.value;
  if (old) await invalidateSession(db, old);
  const { token } = await createSession(db, user.id);
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect(next);
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
