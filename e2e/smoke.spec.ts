import { expect, test } from "@playwright/test";

test("visiting / ends on /events or /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(events|login)/);
});
