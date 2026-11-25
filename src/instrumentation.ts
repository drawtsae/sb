export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ getDb }, { ensureAdminFromEnv }] = await Promise.all([
      import("@/server/db/client"),
      import("@/server/auth/bootstrap"),
    ]);
    await ensureAdminFromEnv(getDb());
  }
}
