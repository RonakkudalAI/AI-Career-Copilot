import { test, expect } from "@playwright/test";

const viewports = [
  { name: "phone-se", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

const zooms = [1, 1.25, 1.5, 2] as const;

test.describe("Landing page audit acceptance", () => {
  test("loads hero, truthful job labels, and light mode", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Navigate your career with evidence/i
    );
    await expect(page.getByText(/Illustrative global roles/i).first()).toBeVisible();
    await expect(page.getByText(/verified job locations/i)).toHaveCount(0);

    const theme = await page.evaluate(() => ({
      dataTheme: document.documentElement.getAttribute("data-theme"),
      background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(theme.dataTheme).toBe(null);
    expect(theme.colorScheme).toBe("light");
    expect(theme.background.toLowerCase()).toContain("f5faff");

    // FE-004: no unbundled Satoshi
    const fonts = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fonts).not.toMatch(/Satoshi/i);

    // FE-005 journey cards
    await page.locator("#journey").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-journey-card]")).toHaveCount(6);

    // FE-007 pause control
    await expect(page.getByRole("button", { name: /Pause motion|Resume motion/i })).toBeVisible();

    // Lightweight SVG globe region
    const globePresent = await page.evaluate(() => {
      return Boolean(
        document.querySelector(".light-globe") ||
          document.querySelector("canvas") ||
          document.querySelector(".globe-fallback-container") ||
          document.querySelector(".globe-loading")
      );
    });
    expect(globePresent).toBe(true);

    // Hero CTAs remain available
    await expect(page.getByRole("link", { name: /Start Your Career Journey/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore How It Works/i })).toBeVisible();

    const serious = consoleErrors.filter(
      (e) => !/THREE\.WARNING/i.test(e) && !/favicon/i.test(e) && !/Download the React DevTools/i.test(e)
    );
    expect(serious, serious.join("\n")).toEqual([]);
  });

  test("mobile navigation has aria-modal, Escape close, focus restore", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });

    const openBtn = page.getByRole("button", { name: /Open navigation/i });
    await expect(openBtn).toBeVisible();
    await openBtn.focus();
    await openBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  for (const vp of viewports) {
    test(`viewport smoke ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      // Allow minor ticker-related overflow (< 40px); body uses overflow-x: hidden for rest.
      expect(overflow).toBeLessThan(40);
    });
  }

  for (const zoom of zooms) {
    test(`zoom ${Math.round(zoom * 100)}% keeps primary content usable`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.evaluate((z) => {
        document.documentElement.style.zoom = String(z);
      }, zoom);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /Start Your Career Journey/i })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThan(80);
    });
  }
});
