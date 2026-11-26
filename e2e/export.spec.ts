import crypto from "node:crypto";
import { expect, test } from "@playwright/test";

const NAME = "Xuất nhập Test";

/** 16-bit mono PCM sine wave. */
function wav(hz: number, seconds: number): Buffer {
  const rate = 22050;
  const n = Math.round(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 0.5 * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("export an event, import it back, and report missing songs", async ({ page, request }) => {
  const audio = wav(620, 15);
  const hash = crypto.createHash("sha256").update(audio).digest("hex");
  const up = await request.put("/api/songs/upload?name=export-song.wav", { data: audio });
  expect(up.status()).toBe(201);

  const settings = { cueFadeSec: 3, bgCrossfadeSec: 4, stopFadeSec: 3, bgVolume: 0.7, masterVolume: 0.9, shuffle: false };
  const cueBase = { startSec: 0, endSec: null, fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "stop", note: "" };
  const seed = {
    version: 1,
    name: NAME,
    settings,
    songs: [
      { ref: "a", title: "export-song", contentHash: hash },
      { ref: "b", title: "bài không có", contentHash: "f".repeat(64) },
    ],
    background: ["a"],
    cues: [
      { ...cueBase, position: 0, kind: "background", name: "Đón khách", songRef: null },
      { ...cueBase, position: 1, kind: "song", name: "Cô dâu vào", songRef: "a" },
    ],
  };
  const file = (name: string, data: unknown) => ({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
  });

  // Import with a song that is not in the library: lists it, does not navigate.
  await page.goto("/events");
  await page.getByTestId("import-input").setInputFiles(file("seed.json", seed));
  await expect(page.getByText("Thiếu bài trong kho:")).toBeVisible();
  await expect(page.getByTestId("import-missing").getByText("bài không có")).toBeVisible();

  // Bad file shows the error.
  await page.getByTestId("import-input").setInputFiles(file("bad.json", "{nope"));
  await expect(page.getByText("File không đúng định dạng")).toBeVisible();

  // Export it through the route.
  await page.goto("/events");
  const row = page.getByTestId("event-row").filter({ hasText: NAME });
  await expect(row).toHaveCount(1);
  const href = await row.getByRole("link", { name: "Xuất JSON" }).getAttribute("href");
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect(res.headers()["content-disposition"]).toContain("filename*=UTF-8''");
  const exported = await res.json();
  expect(exported.cues.map((c: { name: string }) => c.name)).toEqual(["Đón khách", "Cô dâu vào"]);

  // Import it back: no song is missing now (the export lists only the matched one), so it navigates.
  await page.getByTestId("import-input").setInputFiles(file("export.json", JSON.stringify(exported)));
  await page.waitForURL(/\/events\/[^/]+$/);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  const names = page.getByTestId("cue-item").getByLabel("Tên tiết mục");
  await expect(names.nth(0)).toHaveValue("Đón khách");
  await expect(names.nth(1)).toHaveValue("Cô dâu vào");

  // Unknown event is a 404 for the route.
  expect((await request.get("/api/events/nope/export")).status()).toBe(404);
});
