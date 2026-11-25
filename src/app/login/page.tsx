import type { SP } from "@/lib/page-props";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: SP) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Đăng nhập</h1>
      <LoginForm next={safeNext(raw)} />
    </main>
  );
}
