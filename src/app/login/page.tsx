import type { SP } from "@/lib/page-props";
import { safeNext } from "@/lib/safe-next";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: SP) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-card p-8">
        <BrandLogo />
        <h1 className="text-2xl font-semibold">Đăng nhập</h1>
        <LoginForm next={safeNext(raw)} />
      </div>
    </main>
  );
}
