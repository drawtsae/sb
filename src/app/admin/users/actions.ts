"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MIN_PASSWORD } from "@/server/auth/password";
import { requireAdmin } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { createUser, deleteUser, resetPassword } from "@/server/repo/users";

const PATH = "/admin/users";

function fail(code: "short" | "exists" | "invalid"): never {
  redirect(`${PATH}?error=${code}`);
}

// Every action re-checks admin: server actions are public POST endpoints.

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isAdmin = formData.get("isAdmin") === "on";
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) fail("invalid");
  if (password.length < MIN_PASSWORD) fail("short");
  try {
    await createUser(getDb(), email, password, isAdmin);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) fail("exists");
    throw e;
  }
  revalidatePath(PATH);
  redirect(PATH);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id) fail("invalid");
  if (password.length < MIN_PASSWORD) fail("short");
  await resetPassword(getDb(), id, password);
  revalidatePath(PATH);
  redirect(PATH);
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === me.id) fail("invalid"); // an admin cannot delete themselves
  deleteUser(getDb(), id);
  revalidatePath(PATH);
  redirect(PATH);
}
