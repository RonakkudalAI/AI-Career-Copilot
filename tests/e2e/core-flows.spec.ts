import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`BROWSER ERROR: ${error.message}`));
});

test("public landing exposes real account entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /evidence-led career workspace/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Build my profile/i })).toHaveAttribute("href", "/sign-up");
});

test("sign-in has no prefilled candidate credentials", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByText(/Demo sign in|prefilled demo/i)).toHaveCount(0);
});

test("protected routes require a verified Supabase session", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("public pages have no horizontal overflow at required widths", async ({ page }) => {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `${width}x${height} should not overflow`).toBe(false);
  }
});
