import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fx = (n: string) => path.join(__dirname, "fixtures", n);
const row = (page: Page, title: string) =>
  page.getByTestId("song-row").filter({ hasText: title });
const SEARCH = "Tìm theo tên bài hoặc nghệ sĩ";

async function pickFiles(page: Page, files: string[]) {
  await page.getByTestId("upload-input").setInputFiles(files);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Kho nhạc" })).toBeVisible();
});

test("uploads 3 fixtures and shows 3 rows", async ({ page }) => {
  await pickFiles(page, [fx("tone-a-20s.wav"), fx("tone-b-20s.wav"), fx("tone-c-30s.wav")]);
  for (const t of ["tone-a-20s", "tone-b-20s", "tone-c-30s"]) {
    await expect(row(page, t)).toHaveCount(1);
  }
});

test("re-uploading a duplicate asks, and can be skipped", async ({ page }) => {
  await pickFiles(page, [fx("tone-a-20s.wav")]);
  await expect(page.getByText("Bài này đã có trong kho")).toBeVisible();
  await page.getByRole("button", { name: "Bỏ qua" }).click();
  await expect(page.getByText("Bài này đã có trong kho")).toBeHidden();
  await expect(row(page, "tone-a-20s")).toHaveCount(1);
});

test("garbage.mp3 shows a per-file error row with retry", async ({ page }) => {
  await pickFiles(page, [fx("garbage.mp3")]);
  const item = page.getByTestId("upload-item").filter({ hasText: "garbage.mp3" });
  await expect(item).toContainText("File không đọc được");
  await expect(item.getByRole("button", { name: "Thử lại" })).toBeVisible();
});

test("renamed title persists after reload", async ({ page }) => {
  await row(page, "tone-c-30s").getByRole("button", { name: "Sửa" }).click();
  await page.getByLabel("Tên bài").fill("Đám cưới xưa");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(row(page, "Đám cưới xưa")).toHaveCount(1);
  await page.reload();
  await expect(row(page, "Đám cưới xưa")).toHaveCount(1);
  // search is Vietnamese case-insensitive
  await page.getByPlaceholder(SEARCH).fill("ĐÁM CƯỚI");
  await expect(page.getByTestId("song-row")).toHaveCount(1);
});

test("creates a folder, moves a song in, filters by it", async ({ page }) => {
  await page.getByRole("button", { name: "Thư mục mới" }).click();
  await page.getByLabel("Tên thư mục").fill("Nhạc vào");
  await page.getByRole("button", { name: "Tạo" }).click();
  const folder = page.getByTestId("folder-item").filter({ hasText: "Nhạc vào" });
  await expect(folder).toHaveCount(1);

  await row(page, "tone-b-20s").getByRole("button", { name: "Chuyển thư mục" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nhạc vào" }).click();

  await folder.getByRole("button", { name: "Nhạc vào" }).click();
  await expect(page.getByTestId("song-row")).toHaveCount(1);
  await expect(row(page, "tone-b-20s")).toHaveCount(1);
});

test("search tone-b gives one row", async ({ page }) => {
  await page.getByPlaceholder(SEARCH).fill("tone-b");
  await expect(page.getByTestId("song-row")).toHaveCount(1);
});

test("preview shows an audio element", async ({ page }) => {
  await row(page, "tone-a-20s").getByRole("button", { name: "Nghe thử" }).click();
  await expect(page.locator("audio[controls]")).toHaveAttribute("src", /\/api\/songs\/.+\/file/);
});

test("delete with confirm removes the row", async ({ page }) => {
  await row(page, "tone-a-20s").getByRole("button", { name: "Xoá" }).click();
  await expect(page.getByText("Xoá bài này? Không thể hoàn tác.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
  await expect(row(page, "tone-a-20s")).toHaveCount(0);
});
