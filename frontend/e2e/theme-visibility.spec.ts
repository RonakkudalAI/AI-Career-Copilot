import { test, expect } from "@playwright/test";

test.describe("Theme visibility", () => {
  test("profile file picker keeps text readable in both themes", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await context.addCookies([
      { name: "career_copilot_demo", value: "1", url: new URL(page.url()).origin },
    ]);
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Candidate profile" })).toBeVisible();

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((nextTheme) => {
        document.documentElement.setAttribute("data-theme", nextTheme);
        document.documentElement.style.colorScheme = nextTheme;
      }, theme);
      await page.waitForTimeout(350);

      const contrast = await page.locator(".file-picker").first().evaluate((element) => {
        const picker = getComputedStyle(element);
        const button = getComputedStyle(element.querySelector(".file-picker-ui") as Element);
        const name = getComputedStyle(element.querySelector(".file-picker-name") as Element);
        return {
          pickerBackground: picker.backgroundColor,
          pickerText: picker.color,
          buttonBackground: button.backgroundColor,
          buttonText: button.color,
          nameText: name.color,
        };
      });

      expect(contrast.pickerBackground).not.toBe(contrast.pickerText);
      expect(contrast.buttonBackground).not.toBe(contrast.buttonText);
      expect(contrast.nameText).not.toBe(contrast.pickerBackground);
    }
  });
});
