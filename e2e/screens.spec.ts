import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Screenshot pass for the redesign: writes e2e-screens/*.png (git-ignored) for a visual review
// and asserts no horizontal scroll at 1440x900 and 768x1024.
const OUT = path.join(process.cwd(), "e2e-screens");
const TONES = ["tone-a-20s.wav", "tone-b-20s.wav", "tone-c-30s.wav"];
const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures", n));
const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const creds = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, ".auth", "creds.json"), "utf8")) as {
    admin: { email: string; password: string };
  };

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 768, height: 1024 };

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name}: horizontal scroll`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test.describe("login (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: DESKTOP });
  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
    await shot(page, "login");
  });
});

test.describe("app pages", () => {
  test.use({ viewport: DESKTOP });

  test("events, editor, library, load, live", async ({ page, request }) => {
    test.setTimeout(150_000);
    const songs = TONES.map((n, i) => ({ ref: `s${i}`, title: `screens-${n}`, contentHash: sha256(fixture(n)) }));
    for (const n of TONES) {
      const up = await request.put(`/api/songs/upload?name=screens-${n}`, { data: fixture(n) });
      expect(up.status()).toBe(201);
    }
    const base = { startSec: 0, endSec: null, fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "stop", note: "" };
    const seed = {
      version: 1,
      name: "Tiệc cưới Minh & Lan",
      settings: { cueFadeSec: 3, bgCrossfadeSec: 4, stopFadeSec: 3, bgVolume: 0.7, masterVolume: 0.9, shuffle: false },
      songs,
      background: ["s0", "s1"],
      cues: [
        { ...base, position: 0, kind: "background", name: "Đón khách", songRef: null },
        { ...base, position: 1, kind: "song", name: "Cô dâu chú rể vào", songRef: "s2", transition: "crossfade" },
        {
          ...base,
          position: 2,
          kind: "song",
          name: "Cắt bánh kem",
          songRef: "s2",
          transition: "fade_out_in",
          note: "Chờ MC giới thiệu xong rồi mới bấm",
        },
      ],
    };

    await page.goto("/events");
    await page.getByTestId("import-input").setInputFiles({
      name: "screens.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(seed)),
    });
    await page.waitForURL(/\/events\/[^/]+$/);
    const editorUrl = page.url();
    await expect(page.getByText("Cắt bánh kem").first()).toBeVisible();
    await shot(page, "editor");

    await page.goto("/events");
    await expect(page.getByText("Tiệc cưới Minh & Lan").first()).toBeVisible();
    await shot(page, "events");

    await page.goto("/library");
    await expect(page.getByText("screens-tone-a-20s").first()).toBeVisible();
    await shot(page, "library");

    await page.goto(`${editorUrl}/load`);
    await expect(page.getByRole("button", { name: "Bắt đầu tiệc" })).toBeEnabled({ timeout: 30_000 });
    await shot(page, "load");

    await page.getByRole("button", { name: "Bắt đầu tiệc" }).click();
    await page.waitForURL(/\/live$/);
    await page.getByRole("button", { name: "Bấm để bắt đầu điều khiển" }).click();
    await page.keyboard.press("n");
    await expect(page.locator('[data-testid="cue-row"][aria-current="true"]')).toContainText("Đón khách");
    await page.waitForTimeout(350);
    await page.keyboard.press("n");
    await expect(page.locator('[data-testid="cue-row"][aria-current="true"]')).toContainText("Cô dâu chú rể vào");
    await page.waitForTimeout(1000);
    await shot(page, "live");

    // Editor at tablet width.
    await page.setViewportSize(TABLET);
    await page.goto(editorUrl);
    await expect(page.getByText("Cắt bánh kem").first()).toBeVisible();
    await shot(page, "editor-768");
  });
});

test.describe("admin", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: DESKTOP });
  test("admin users", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(creds().admin.email);
    await page.getByLabel("Mật khẩu").fill(creds().admin.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/\/events$/);
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Người dùng" })).toBeVisible();
    await shot(page, "admin-users");
  });
});
