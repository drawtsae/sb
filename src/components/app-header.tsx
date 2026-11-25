import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { User } from "@/server/auth/session";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/events">Sự kiện</Link>
        <Link href="/library">Kho nhạc</Link>
        {user.isAdmin ? <Link href="/admin/users">Người dùng</Link> : null}
      </nav>
      <form action={logout} className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <Button type="submit" variant="outline" size="sm">
          Đăng xuất
        </Button>
      </form>
    </header>
  );
}
