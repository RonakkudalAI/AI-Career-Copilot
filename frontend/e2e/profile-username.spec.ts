import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function enterDemo(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.context().addCookies([
    { name: "career_copilot_demo", value: "1", url: new URL(page.url()).origin },
  ]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".workspace")).toBeVisible();
}

test.describe("profile username", () => {
  test("Google/existing users can set a username on the profile page", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Candidate profile" })).toBeVisible();
    const username = page.getByRole("textbox", { name: /username/i });
    await expect(username).toBeVisible();
    await expect(username).toBeEnabled();
    await username.fill("priyansu_dev");
    await expect(page.locator("#profile-username-hint")).toContainText(/priyansu_dev/i, { timeout: 8_000 });
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByText(/profile saved/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("link", { name: "@priyansu_dev" })).toBeVisible();
  });
});
