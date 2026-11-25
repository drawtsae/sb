import { expect, test, type Page } from "@playwright/test";

const NAME = "Đám cưới Test";

/** 16-bit mono PCM sine wave, enough for the library to accept it as a song. */
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

const saved = (page: Page) => page.getByTestId("save-indicator");
async function waitSaved(page: Page) {
  await expect(saved(page)).toHaveText("Đang lưu…");
  await expect(saved(page)).toHaveText("Đã lưu");
}
// Structural saves are immediate and may finish before we can observe "Đang lưu…".
const waitIdle = (page: Page) => expect(saved(page)).toHaveText("Đã lưu");
const bgTitles = (page: Page) => page.getByTestId("bg-item").locator("span.truncate");

test.describe.configure({ mode: "serial" });

let editorUrl = "";

test("uploads songs, creates the event and builds the background playlist", async ({ page, request }) => {
  // Own songs (distinct audio, names that do not collide with library.spec's fixtures).
  for (const [name, hz, sec] of [
    ["editor-bg-1.wav", 300, 12],
    ["editor-bg-2.wav", 350, 12],
    ["editor-cue.wav", 500, 30],
  ] as const) {
    const res = await request.put(`/api/songs/upload?name=${name}`, { data: wav(hz, sec) });
    expect([201, 409]).toContain(res.status());
  }

  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Chương trình" })).toBeVisible();
  await page.getByRole("button", { name: "Tạo chương trình" }).click();
  await page.getByLabel("Tên chương trình").fill(NAME);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo" }).click();
  await page.waitForURL(/\/events\/[^/]+$/);
  editorUrl = page.url();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  for (const h of ["Nhạc nền", "Kịch bản", "Cài đặt"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }

  for (const t of ["editor-bg-1", "editor-bg-2"]) {
    await page.getByRole("button", { name: "Thêm bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: t }).click();
    await expect(page.getByTestId("bg-item").filter({ hasText: t })).toHaveCount(1);
  }
  await expect(bgTitles(page)).toHaveText(["editor-bg-1", "editor-bg-2"]);

  // Keyboard-accessible reorder fallback.
  await page.getByTestId("bg-item").first().getByRole("button", { name: "Chuyển xuống" }).click();
  await expect(bgTitles(page)).toHaveText(["editor-bg-2", "editor-bg-1"]);
  await waitIdle(page);

  await page.reload();
  await expect(bgTitles(page)).toHaveText(["editor-bg-2", "editor-bg-1"]);
});

test("cues: background cue, song cue, validation, persistence", async ({ page }) => {
  await page.goto(editorUrl);

  // 1) background cue
  await page.getByRole("button", { name: "Thêm tiết mục" }).click();
  const first = page.getByTestId("cue-item").nth(0);
  await first.getByLabel("Loại").selectOption({ label: "Nhạc nền" });
  await first.getByLabel("Tên tiết mục").fill("Đón khách");
  // The blank song cue was invalid; the indicator reads "Lỗi lưu" until the fix is saved.
  await waitIdle(page);

  // 2) a song cue with no song is invalid and says why
  await page.getByRole("button", { name: "Thêm tiết mục" }).click();
  const second = page.getByTestId("cue-item").nth(1);
  await expect(second.getByText("Tiết mục loại Bài riêng phải chọn bài hát")).toBeVisible();
  await expect(saved(page)).toHaveText("Lỗi lưu, thử lại");

  // 3) fix it: pick the song, name, start 0:05, "Dừng"
  await second.getByRole("button", { name: "Chọn bài hát…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "editor-cue" }).click();
  await second.getByLabel("Tên tiết mục").fill("Cô dâu chú rể vào");
  await second.getByLabel("Giây bắt đầu", { exact: true }).fill("0:05");
  await second.getByLabel("Khi hết bài").selectOption({ label: "Dừng" });
  await expect(second.getByText("Tiết mục loại Bài riêng phải chọn bài hát")).toBeHidden();
  await expect(saved(page)).toHaveText("Đã lưu");

  await page.reload();
  const cues = page.getByTestId("cue-item");
  await expect(cues).toHaveCount(2);
  await expect(cues.nth(0).getByLabel("Tên tiết mục")).toHaveValue("Đón khách");
  await expect(cues.nth(0).getByLabel("Loại")).toHaveValue("background");
  await expect(cues.nth(1).getByLabel("Tên tiết mục")).toHaveValue("Cô dâu chú rể vào");
  await expect(cues.nth(1).getByLabel("Giây bắt đầu", { exact: true })).toHaveValue("0:05");
  await expect(cues.nth(1).getByLabel("Khi hết bài")).toHaveValue("stop");
  await expect(cues.nth(1).getByRole("button", { name: "editor-cue" })).toBeVisible();
  const song = cues.nth(1);
  await expect(song.getByRole("button", { name: "Nghe thử từ điểm này" }).first()).toBeVisible();
  await expect(song.locator("audio").first()).toHaveAttribute("src", /\/api\/songs\/.+\/file/);

  // "Lấy vị trí đang nghe" copies the audio position into the field.
  await song.locator("audio").first().evaluate(async (a: HTMLAudioElement) => {
    if (a.readyState < 1) await new Promise((r) => a.addEventListener("loadedmetadata", r, { once: true }));
    a.currentTime = 7.3;
  });
  await song.getByRole("button", { name: "Lấy vị trí đang nghe" }).first().click();
  await expect(song.getByLabel("Giây bắt đầu", { exact: true })).toHaveValue("0:07.3");
  await waitSaved(page);
  await song.getByLabel("Giây bắt đầu", { exact: true }).fill("0:05");
  await waitSaved(page);
});

test("a song cue with no song shows the validation message and is not saved", async ({ page }) => {
  await page.goto(editorUrl);
  await page.getByRole("button", { name: "Thêm tiết mục" }).click();
  const cue = page.getByTestId("cue-item").nth(2);
  await expect(cue.getByText("Tiết mục loại Bài riêng phải chọn bài hát")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("cue-item")).toHaveCount(2);
});

test("settings persist", async ({ page }) => {
  await page.goto(editorUrl);
  await page.getByLabel("Chuyển tiết mục").fill("5");
  await waitSaved(page);
  await page.reload();
  await expect(page.getByLabel("Chuyển tiết mục")).toHaveValue("5");
  await expect(page.getByLabel("Âm lượng nhạc nền")).toHaveValue("70");
});

test("duplicating the event copies its cues", async ({ page }) => {
  await page.goto("/events");
  const row = page.getByTestId("event-row").filter({ hasText: new RegExp(`^${NAME}(?! \\()`) });
  await expect(row.getByRole("link", { name: "Kiểm tra & nạp" })).toHaveAttribute("href", /\/events\/.+\/load$/);
  await row.getByRole("button", { name: "Nhân bản" }).click();
  await page.getByLabel("Tên chương trình").fill(`${NAME} (bản sao)`);
  await page.getByRole("dialog").getByRole("button", { name: "Nhân bản" }).click();
  const copy = page.getByTestId("event-row").filter({ hasText: `${NAME} (bản sao)` });
  await expect(copy).toHaveCount(1);
  await copy.getByRole("link", { name: `${NAME} (bản sao)` }).click();
  await expect(page.getByTestId("cue-item")).toHaveCount(2);
  await expect(bgTitles(page)).toHaveText(["editor-bg-2", "editor-bg-1"]);
  await expect(page.getByLabel("Chuyển tiết mục")).toHaveValue("5");
});

test("deleting an event asks for confirmation", async ({ page }) => {
  await page.goto("/events");
  const copy = page.getByTestId("event-row").filter({ hasText: `${NAME} (bản sao)` });
  await copy.getByRole("button", { name: "Xoá" }).click();
  await expect(page.getByText("Xoá chương trình này? Không thể hoàn tác.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
  await expect(copy).toHaveCount(0);
});
