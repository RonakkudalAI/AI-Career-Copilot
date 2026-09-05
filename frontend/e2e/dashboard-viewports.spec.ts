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

const VIEWPORTS = [
  { name: "Desktop (1440x900)", width: 1440, height: 900 },
  { name: "Laptop (1024x768)", width: 1024, height: 768 },
  { name: "Tablet (768x1024)", width: 768, height: 1024 },
  { name: "Mobile iPhone (390x844)", width: 390, height: 844 },
  { name: "Small Mobile (320x568)", width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test(`Dashboard responsive compatibility: ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await enterDemo(page);

    // Verify main sections
    const metricsGrid = page.locator(".dashboard-metrics-grid");
    await expect(metricsGrid).toBeVisible();

    const visualGrid = page.locator(".dashboard-visual-grid");
    await expect(visualGrid).toBeVisible();

    // Verify stat cards
    const statCards = page.locator(".dashboard-stat-card");
    await expect(statCards).toHaveCount(4);

    // Verify mini rings and animated gauges are present
    const miniRings = page.locator(".mini-metric-ring");
    await expect(miniRings.first()).toBeVisible();

    // Verify no horizontal overflow in dashboard page
    const hasHorizontalOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
}
