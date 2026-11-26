import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const path = vi.hoisted(() => ({ current: "/events" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("@/app/login/actions", () => ({ logout: vi.fn() }));

import { AppShell } from "@/components/app-shell";
import type { User } from "@/server/auth/session";

const user = (isAdmin: boolean): User => ({ id: "u1", email: "a@b.vn", isAdmin }) as User;

afterEach(cleanup);
beforeEach(() => {
  path.current = "/events";
});

describe("AppShell", () => {
  it("shows the nav links, no admin link and a logout button for a normal user", () => {
    render(<AppShell user={user(false)}>x</AppShell>);
    expect(screen.getByRole("link", { name: "Chương trình" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "Kho nhạc" })).toHaveAttribute("href", "/library");
    expect(screen.queryByRole("link", { name: "Người dùng" })).toBeNull();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("shows the admin link for admins", () => {
    render(<AppShell user={user(true)}>x</AppShell>);
    expect(screen.getByRole("link", { name: "Người dùng" })).toHaveAttribute("href", "/admin/users");
  });

  it("marks the active item for nested paths", () => {
    path.current = "/library/x";
    render(<AppShell user={user(false)}>x</AppShell>);
    expect(screen.getByRole("link", { name: "Kho nhạc" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chương trình" })).not.toHaveAttribute("aria-current");
  });

  it("toggles the menu panel on small screens", () => {
    const { container } = render(<AppShell user={user(false)}>content</AppShell>);
    const aside = container.querySelector("aside") as HTMLElement;
    const btn = screen.getByRole("button", { name: "Mở menu" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(aside).toHaveClass("hidden");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(aside).not.toHaveClass("hidden");
    fireEvent.click(screen.getByRole("link", { name: "Kho nhạc" }));
    expect(aside).toHaveClass("hidden");
    fireEvent.click(btn);
    expect(aside).not.toHaveClass("hidden");
    fireEvent.click(btn);
    expect(aside).toHaveClass("hidden");
    expect(screen.getByRole("main")).toHaveTextContent("content");
  });
});
