import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function enterDemo(page: Page, path: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.context().addCookies([
    { name: "career_copilot_demo", value: "1", url: new URL(page.url()).origin },
  ]);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".workspace")).toBeVisible({ timeout: 10000 });
}

const PAGES = [
  { path: "/dashboard", name: "Dashboard", containerSel: ".dashboard-page" },
  { path: "/jobs", name: "Job Radar", containerSel: ".jobs-radar-page" },
  { path: "/mock-interview", name: "Mock Interview", containerSel: ".interview-hub" },
  { path: "/resume-analysis", name: "Resume Analysis", containerSel: ".ra-page" },
  { path: "/learning", name: "Learning Paths", containerSel: ".lp-page" },
  { path: "/community", name: "Community", containerSel: ".community-page" },
];

test.describe("Uniform Layout Gaps and Spacing Rhythm", () => {
  for (const p of PAGES) {
    test(`Page ${p.name} has uniform 24px gap and bounded container width`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await enterDemo(page, p.path);

      const container = page.locator(p.containerSel).first();
      await expect(container).toBeVisible();

      // Check computed styles on container
      const styles = await container.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          rowGap: cs.rowGap,
          gap: cs.gap,
          maxWidth: cs.maxWidth,
          width: rect.width,
        };
      });

      // Gap between top-level sections must be 24px
      const gapVal = styles.rowGap || styles.gap;
      expect(gapVal).toBe("24px");

      // Container max-width must be bounded to 1180px
      expect(styles.maxWidth).toBe("1180px");
      expect(styles.width).toBeLessThanOrEqual(1181);

      // Verify no horizontal overflow
      const overflow = await page.evaluate(() => {
        return {
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
          htmlScrollWidth: document.documentElement.scrollWidth,
          htmlClientWidth: document.documentElement.clientWidth,
        };
      });

      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 1);
      expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(overflow.htmlClientWidth + 1);
    });
  }

  test("Jobs Radar cards and filters have uniform 16px grid gaps and 18px radii", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterDemo(page, "/jobs");

    const statRail = page.locator(".jobs-stat-rail");
    await expect(statRail).toBeVisible();

    const statStyles = await statRail.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { gap: cs.gap, marginBottom: cs.marginBottom };
    });
    expect(statStyles.gap).toBe("16px");
    expect(statStyles.marginBottom).toBe("0px");

    const filters = page.locator(".filters-bar");
    await expect(filters).toBeVisible();
    const filterStyles = await filters.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { borderRadius: cs.borderRadius, marginBottom: cs.marginBottom };
    });
    expect(["18px", "20px"]).toContain(filterStyles.borderRadius);
    expect(filterStyles.marginBottom).toBe("0px");
  });
});
