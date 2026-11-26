import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Request } from "@playwright/test";

const NAME = "Offline Test";
const TONES = ["tone-a-20s.wav", "tone-b-20s.wav", "tone-c-30s.wav"];
const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures", n));
const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

test("after Kiểm tra & nạp, /live reloads offline from the SW and the music cache", async ({ page, context, request }) => {
  test.setTimeout(120_000); // load + SW install + a short offline show
  // The 3 tone fixtures (a 409 means another spec already uploaded the same bytes; matching is by hash).
  const songs = TONES.map((n, i) => ({ ref: `s${i}`, title: `offline-${n}`, contentHash: sha256(fixture(n)) }));
  for (const n of TONES) {
    const up = await request.put(`/api/songs/upload?name=offline-${n}`, { data: fixture(n) });
    expect([201, 409]).toContain(up.status());
  }

  // Event: two background tracks plus one song cue, so it uses 3 distinct songs.
  const cueBase = { startSec: 0, endSec: null, fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "stop", note: "" };
  const seed = {
    version: 1,
    name: NAME,
    settings: { cueFadeSec: 3, bgCrossfadeSec: 4, stopFadeSec: 3, bgVolume: 0.7, masterVolume: 0.9, shuffle: false },
    songs,
    background: ["s0", "s1"],
    cues: [
      { ...cueBase, position: 0, kind: "background", name: "Đón khách", songRef: null },
      { ...cueBase, position: 1, kind: "song", name: "Cô dâu chú rể vào", songRef: "s2" },
    ],
  };
  await page.goto("/events");
  await page.getByTestId("import-input").setInputFiles({
    name: "offline.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await page.waitForURL(/\/events\/[^/]+$/);
  const editorUrl = page.url();

  // Load: the badge needs the snapshot, the music cache and an active SW controlling the page.
  await page.goto(`${editorUrl}/load`);
  await expect(page.getByRole("button", { name: "Bắt đầu tiệc" })).toBeEnabled({ timeout: 30_000 });
  const badge = page.getByTestId("offline-badge");
  try {
    await expect(badge).toHaveText("Sẵn sàng offline", { timeout: 15_000 });
  } catch {
    // The SW may still be installing (precache) on the first visit; a reload picks up the controller.
    await page.reload();
    await expect(badge).toHaveText("Sẵn sàng offline", { timeout: 30_000 });
  }
  // Make sure the SW finished precaching (it is active) before going offline.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // Offline from here on. "Bắt đầu tiệc" is a full-document navigation (so Back mid-show hits
  // beforeunload); the SW answers it from the precache.
  await context.setOffline(true);
  const startNav = page.waitForResponse((r) => new URL(r.url()).pathname === "/live" && r.request().isNavigationRequest());
  await page.getByRole("button", { name: "Bắt đầu tiệc" }).click();
  expect((await startNav).fromServiceWorker()).toBe(true);
  await page.waitForURL(/\/live$/);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();

  // Reload /live: it renders from the precache + localStorage snapshot.
  const requests: Request[] = [];
  const failed: string[] = [];
  context.on("request", (r) => requests.push(r));
  // Offline, anything that tried to reach the server (not answered by the SW) fails.
  context.on("requestfailed", (r) => failed.push(r.url()));
  const res = await page.goto("/live");
  expect(res?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(page.getByText("Chưa nạp chương trình nào")).toHaveCount(0);

  const api = requests.filter((r) => new URL(r.url()).pathname.startsWith("/api/"));
  expect(api.map((r) => r.url())).toEqual([]);
  expect(failed).toEqual([]);
  const musicKeys = await page.evaluate(async () => (await (await caches.open("sb-music-v1")).keys()).length);
  expect(musicKeys).toBe(3);

  // The SW caches hold only static assets and /live: nothing authenticated, no API, no music.
  const swCached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      if (name === "sb-music-v1") continue;
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    }
    return out;
  });
  expect(swCached).toContain("/live");
  expect(swCached.filter((p) => !/^\/(_next\/static\/|icons\/|live$|favicon\.ico$|manifest\.webmanifest$)/.test(p))).toEqual([]);

  // Run the show offline. Nothing plays before the operator clicks the overlay.
  await page.getByRole("button", { name: "Bấm để bắt đầu điều khiển" }).click();
  const current = page.locator('[data-testid="cue-row"][aria-current="true"]');
  const nowPlaying = page.getByTestId("now-playing");
  await page.keyboard.press("n");
  await expect(current).toContainText("Đón khách");
  await expect(nowPlaying).toContainText("[Nhạc nền]");
  await page.waitForTimeout(350); // a second N within 300 ms is treated as a double press
  await page.keyboard.press("n");
  await expect(current).toContainText("Cô dâu chú rể vào");
  await expect(nowPlaying).toContainText("[Tiết mục]");
  await expect(nowPlaying).toContainText("→ hết bài: dừng");
  const cueDeck = page.locator("audio[data-deck=cue0]");
  await expect(cueDeck).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => cueDeck.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > 0)).toBe(true);

  // Space does nothing, even with a control focused ("Về nhạc nền" would leave the cue).
  await page.getByRole("button", { name: "Về nhạc nền" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  await expect(current).toContainText("Cô dâu chú rể vào");
  await expect(nowPlaying).toContainText("[Tiết mục]");

  await page.keyboard.press("f");
  await expect(page.getByText("ĐANG IM LẶNG")).toBeVisible({ timeout: 4_000 });

  // Reload mid-show (beforeunload asks first): resume from the saved state, still silent.
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.accept();
  });
  await page.reload();
  expect(dialogs).toEqual(["beforeunload"]);
  await page.getByRole("button", { name: "Tiếp tục từ chỗ cũ" }).click();
  await page.getByRole("button", { name: "Bấm để bắt đầu điều khiển" }).click();
  await expect(current).toContainText("Cô dâu chú rể vào");
  await expect(page.locator('[data-testid="cue-row"][data-played="true"]')).toHaveCount(2);
  await expect(page.getByText("ĐANG IM LẶNG")).toBeVisible();

  // The whole show never reached the server.
  expect(requests.filter((r) => /^\/(api|__music)\//.test(new URL(r.url()).pathname)).map((r) => r.url())).toEqual([]);

  await context.setOffline(false);
});

test("/live without a snapshot shows the empty state", async ({ page }) => {
  await page.goto("/live");
  await expect(page.getByText("Chưa nạp chương trình nào")).toBeVisible();
});

test.describe("with the service worker controlling the page", () => {
  // Own session: logging out must not end the shared storageState session other specs use.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("logout then login still work (no page is served from a SW cache)", async ({ page }) => {
    const { op } = JSON.parse(fs.readFileSync(path.join(__dirname, ".auth", "creds.json"), "utf8")) as {
      op: { email: string; password: string };
    };
    const login = async () => {
      await page.getByLabel("Email").fill(op.email);
      await page.getByLabel("Mật khẩu").fill(op.password);
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await page.waitForURL(/\/events$/);
    };
    // The SW installs (precaches) while logged out: every precached file must be public.
    await page.goto("/login");
    const precached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const out: Record<string, string> = {};
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          const p = new URL(req.url).pathname;
          if (p === "/live" || p.startsWith("/icons/")) out[p] = (await cache.match(req))?.headers.get("content-type") ?? "";
        }
      }
      return out;
    });
    expect(precached["/live"]).toContain("text/html");
    expect(precached["/icons/icon-192.png"]).toBe("image/png");
    expect(precached["/icons/icon-512.png"]).toBe("image/png");

    await login();
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await page.waitForURL(/\/login$/);
    // A protected page now redirects (not a cached copy of /events), and the API is 401.
    await page.goto("/events");
    await expect(page).toHaveURL(/\/login\?next=%2Fevents$/);
    expect(await page.evaluate(async () => (await fetch("/api/songs/by-hash?h=x")).status)).toBe(401);

    await login();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });
});
