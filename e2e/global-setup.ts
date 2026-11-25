import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const authDir = path.join(__dirname, ".auth");
  fs.mkdirSync(authDir, { recursive: true });

  const admin = { email: "admin@test.local", password: process.env.E2E_ADMIN_PASSWORD! };
  const op = { email: "op@test.local", password: crypto.randomBytes(18).toString("base64url") };

  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "scripts/create-user.ts",
      "--email",
      op.email,
      "--password",
      op.password,
    ],
    { env: { ...process.env, DATA_DIR: ".e2e-data" }, stdio: "inherit" },
  );

  fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify({ admin, op }));

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, storageState: undefined });
  await page.goto("/login");
  await page.getByLabel("Email").fill(op.email);
  await page.getByLabel("Mật khẩu").fill(op.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL(/\/events$/);
  await page.context().storageState({ path: path.join(authDir, "state.json") });
  await browser.close();
}
