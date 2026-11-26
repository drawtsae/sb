import { logout } from "@/app/login/actions";
import { ShellFrame } from "@/components/shell-frame";
import type { User } from "@/server/auth/session";

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <ShellFrame email={user.email} isAdmin={user.isAdmin} logoutAction={logout}>
      {children}
    </ShellFrame>
  );
}
