import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DATA_DIR = ".e2e-data";

// The webServer starts before globalSetup, so wipe the e2e data dir here.
// Workers re-evaluate this file; only wipe/generate in the main process.
if (!process.env.E2E_ADMIN_PASSWORD) {
  fs.rmSync(path.resolve(DATA_DIR), { recursive: true, force: true });
  process.env.E2E_ADMIN_PASSWORD = crypto.randomBytes(18).toString("base64url");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    storageState: "e2e/.auth/state.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    env: {
      DATA_DIR,
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
      COOKIE_SECURE: "false",
    },
    timeout: 240_000,
  },
});
