import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const NAME = "Nạp nhạc Test";
const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures", n));

test("load page blocks on a bad cue, then enables Bắt đầu tiệc after the fix", async ({ page, request }) => {
  for (const n of ["tone-a-20s.wav", "tone-b-20s.wav"]) {
    const up = await request.put(`/api/songs/upload?name=load-${n}`, { data: fixture(n) });
    expect(up.status()).toBe(201);
  }

  await page.goto("/events");
  await page.getByRole("button", { name: "Tạo chương trình" }).click();
  await page.getByLabel("Tên chương trình").fill(NAME);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo" }).click();
  await page.waitForURL(/\/events\/[^/]+$/);
  const editorUrl = page.url();
  const saved = page.getByTestId("save-indicator");

  await page.getByRole("button", { name: "Thêm bài" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "load-tone-a-20s" }).click();
  await expect(page.getByTestId("bg-item")).toHaveCount(1);

  for (const t of ["load-tone-a-20s", "load-tone-b-20s"]) {
    await page.getByRole("button", { name: "Thêm tiết mục" }).click();
    const item = page.getByTestId("cue-item").last();
    await item.getByLabel("Tên tiết mục").fill(`Tiết mục ${t}`);
    await item.getByRole("button", { name: "Chọn bài hát…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: t }).click();
  }
  // Second cue starts at 0:40, past the 20 s song.
  const start = page.getByTestId("cue-item").last().getByLabel("Giây bắt đầu", { exact: true });
  await start.fill("0:40");
  await expect(saved).toHaveText("Đã lưu");

  await page.goto(`${editorUrl}/load`);
  await expect(page.getByTestId("load-errors").getByText("Giây bắt đầu vượt quá độ dài bài")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bắt đầu tiệc" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Thử chế độ offline" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("sb:snapshot"))).toBeNull();

  // Fix the cue in the editor.
  await page.goto(editorUrl);
  const fixStart = page.getByTestId("cue-item").last().getByLabel("Giây bắt đầu", { exact: true });
  await fixStart.fill("0:05");
  await expect(saved).toHaveText("Đã lưu");

  await page.goto(`${editorUrl}/load`);
  await expect(page.getByRole("button", { name: "Bắt đầu tiệc" })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Thử chế độ offline" })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("sb:snapshot"))).not.toBeNull();
});
