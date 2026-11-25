import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    port: PORT, // TCP check: / redirects to /events, which 404s until Task 4
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
    timeout: 120_000,
  },
});
