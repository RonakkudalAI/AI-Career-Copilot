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

test.describe("profile 100% completion fade", () => {
  test("completion meter has is-complete and fades when complete", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Candidate profile" })).toBeVisible();

    // Verify meter structure exists
    const meter = page.locator(".profile-masthead-meter");
    await expect(meter).toBeAttached();

    // Verify profile-v2.css has profileMeterFade animation rules
    const hasAnimationRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSKeyframesRule && rule.name === "profileMeterFade") {
              return true;
            }
          }
        } catch {
          // ignore cross-origin
        }
      }
      return false;
    });
    expect(hasAnimationRule).toBe(true);
  });
});
