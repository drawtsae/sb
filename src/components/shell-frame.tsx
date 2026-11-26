"use client";

import { ListMusic, Library, LogOut, Menu, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { OfflineStatus } from "@/components/offline-status";
import { cn } from "cn";

const ITEMS = [
  { href: "/events", label: "Chương trình", icon: ListMusic, admin: false },
  { href: "/library", label: "Kho nhạc", icon: Library, admin: false },
  { href: "/admin/users", label: "Người dùng", icon: Users, admin: true },
];

function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-1">
      {ITEMS.filter((i) => !i.admin || isAdmin).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className={cn("size-5", active && "text-gold")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ShellFrame({
  email,
  isAdmin,
  logoutAction,
  children,
}: {
  email: string;
  isAdmin: boolean;
  logoutAction: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <BrandLogo />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label="Mở menu"
          onClick={() => setOpen((o) => !o)}
          className="flex size-11 items-center justify-center rounded-[10px] text-foreground transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </header>
      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-x-0 top-14 bottom-0 z-20 flex-col gap-6 overflow-y-auto border-r border-border bg-card p-4",
          "lg:inset-y-0 lg:right-auto lg:top-0 lg:flex lg:w-[248px]",
          open ? "flex" : "hidden",
        )}
      >
        <BrandLogo className="hidden lg:inline-flex" />
        <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        <div className="mt-auto flex flex-col gap-3">
          <OfflineStatus />
          <form action={logoutAction} className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </span>
            <button
              type="submit"
              className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-5" aria-hidden />
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
