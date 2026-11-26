import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const creds = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, ".auth", "creds.json"), "utf8")) as {
    admin: { email: string; password: string };
    op: { email: string; password: string };
  };

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/library redirects to login with next", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);
  });

  test("api without session is 401", async ({ request }) => {
    const res = await request.get("/api/songs/by-hash?h=x");
    expect(res.status()).toBe(401);
  });

  test("/live is public", async ({ request }) => {
    const res = await request.get("/live", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(creds().op.email);
    await page.getByLabel("Mật khẩu").fill("definitely-wrong");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByText("Sai email hoặc mật khẩu")).toBeVisible();
  });

  test("correct login lands on next", async ({ page }) => {
    await page.goto("/login?next=%2Flibrary");
    await page.getByLabel("Email").fill(creds().op.email);
    await page.getByLabel("Mật khẩu").fill(creds().op.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("external next is ignored", async ({ page }) => {
    await page.goto("/login?next=%2F%2Fevil.example");
    await page.getByLabel("Email").fill(creds().op.email);
    await page.getByLabel("Mật khẩu").fill(creds().op.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/localhost:3100\/events$/);
  });
});

test("non-admin opening /admin/users goes to /events", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/events$/);
});

test("admin can create and delete a user", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds().admin.email);
  await page.getByLabel("Mật khẩu").fill(creds().admin.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL(/\/events$/);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Người dùng" })).toBeVisible();
  await page.getByLabel("Email").fill("new@test.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("a-long-enough-pass");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  const row = page.getByRole("row", { name: /new@test\.local/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Xoá" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Xoá tài khoản này? Không thể hoàn tác.");
  await confirm.getByRole("button", { name: "Huỷ" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Xoá" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
  await expect(page.getByRole("row", { name: /new@test\.local/ })).toHaveCount(0);
});
