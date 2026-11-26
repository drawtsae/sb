import type { SP } from "@/lib/page-props";
import { AppShell } from "@/components/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { listUsers } from "@/server/repo/users";
import { createUserAction, deleteUserAction, resetPasswordAction } from "./actions";
import { DeleteUserForm } from "./DeleteUserForm";

const input =
  "h-11 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ERRORS: Record<string, string> = {
  short: "Mật khẩu tối thiểu 8 ký tự",
  exists: "Email đã tồn tại",
  invalid: "Dữ liệu không hợp lệ",
};

export default async function UsersPage({ searchParams }: SP) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const code = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const error = code ? ERRORS[code] : undefined;
  const users = listUsers(getDb());

  return (
    <AppShell user={me}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">Người dùng</h1>
        <div>
          <a href="/api/admin/backup" download className={buttonVariants({ variant: "outline" })}>
            Tải bản sao lưu database
          </a>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <form
          action={createUserAction}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-email" className="text-sm font-medium">
              Email
            </label>
            <input id="new-email" name="email" type="email" required className={input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="text-sm font-medium">
              Mật khẩu
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              className={input}
            />
          </div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="isAdmin" className="size-5 accent-primary" /> Quản trị viên
          </label>
          <Button type="submit">Tạo tài khoản</Button>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card px-4 py-2">
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-2">
                <td className="py-2 pr-2">{u.email}</td>
                <td className="py-2 pr-2 text-muted-foreground">{u.isAdmin ? "Quản trị viên" : ""}</td>
                <td className="py-2 pr-2">
                  <form action={resetPasswordAction} className="flex gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      aria-label={`Mật khẩu mới cho ${u.email}`}
                      className={input}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Đặt lại mật khẩu
                    </Button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  {u.id !== me.id ? (
                    <DeleteUserForm id={u.id} email={u.email} action={deleteUserAction} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </AppShell>
  );
}
