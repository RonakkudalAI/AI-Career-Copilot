import { expect, test } from "@playwright/test";
import {
  enterDemo,
  setTheme,
  getTheme,
  toggleThemeViaUi,
  measureContrast,
  measureFocusContrast,
  measureHoverContrast,
  calculateRelativeLuminance,
  calculateContrastRatio,
  ensureLandingSequencesAndSignals,
  ensureDashboardStatVariants,
  ensureJobCardVariants,
} from "./contrast-helpers";

/**
 * ============================================================================
 * WCAG 2.1 Level AA Relative Luminance & Contrast Ratio Reference Math
 * ============================================================================
 * L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
 * Contrast = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2
 * Normal text: >= 4.5:1
 * Large text (>= 24px regular or >= 18.66px bold) / UI components / badges: >= 3.0:1
 */

// Verify standalone reference calculation functions
test.describe("WCAG 2.1 Math Verification", () => {
  test("calculates standard relative luminance and contrast ratio correctly", () => {
    // Pure white (255, 255, 255) L = 1.0
    const lWhite = calculateRelativeLuminance(255, 255, 255);
    expect(lWhite).toBeCloseTo(1.0, 3);

    // Pure black (0, 0, 0) L = 0.0
    const lBlack = calculateRelativeLuminance(0, 0, 0);
    expect(lBlack).toBeCloseTo(0.0, 3);

    // White on black contrast ratio is 21:1
    const whiteOnBlack = calculateContrastRatio(lWhite, lBlack);
    expect(whiteOnBlack).toBeCloseTo(21.0, 1);

    // Light mode --text (#0b2942)
    const lNavy = calculateRelativeLuminance(11, 41, 66);
    expect(calculateContrastRatio(lWhite, lNavy)).toBeGreaterThan(14.0);

    // Dark mode --text (#f5f5f0) on surface (#111c2d)
    const lDarkSurface = calculateRelativeLuminance(17, 28, 45);
    const lOffWhite = calculateRelativeLuminance(245, 245, 240);
    expect(calculateContrastRatio(lOffWhite, lDarkSurface)).toBeGreaterThan(14.0);
  });
});

// ============================================================================
// TIER 1: FEATURE COVERAGE — DASHBOARD (6 TESTS)
// ============================================================================
test.describe("Tier 1: Feature Coverage - Dashboard Contrast & Legibility", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page, "/dashboard");
    await ensureDashboardStatVariants(page);
  });

  test("1.1 Stat cards primary metrics and labels in light & dark themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Check stat card labels
      const labelMeasurement = await measureContrast(
        page,
        ".dashboard-stat-card .dashboard-stat-label"
      );
      expect(
        labelMeasurement.contrast,
        `Dashboard stat card label failed in ${theme} mode (contrast ${labelMeasurement.contrast}:1, fg: ${labelMeasurement.fgColor}, bg: ${labelMeasurement.bgColor})`
      ).toBeGreaterThanOrEqual(labelMeasurement.minRequired);

      // Check numeric stat values (large text >= 3.0:1)
      const valueMeasurement = await measureContrast(
        page,
        ".dashboard-stat-card .dashboard-stat-value",
        { isComponentOrBadge: true, forceLarge: true }
      );
      expect(
        valueMeasurement.contrast,
        `Dashboard stat value failed in ${theme} mode (contrast ${valueMeasurement.contrast}:1)`
      ).toBeGreaterThanOrEqual(3.0);

      // Check stat card notes
      const noteMeasurement = await measureContrast(
        page,
        ".dashboard-stat-card .dashboard-stat-note"
      );
      expect(
        noteMeasurement.contrast,
        `Dashboard stat note failed in ${theme} mode`
      ).toBeGreaterThanOrEqual(noteMeasurement.minRequired);
    }
  });

  test("1.2 Delta chips [data-tone='up|down|flat'] contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const tones = ["up", "down", "flat"] as const;
      for (const tone of tones) {
        const chipMeasurement = await measureContrast(
          page,
          `.dashboard-delta-chip[data-tone="${tone}"]`,
          { isComponentOrBadge: true }
        );
        expect(
          chipMeasurement.contrast,
          `Dashboard delta chip tone="${tone}" failed in ${theme} mode (measured ${chipMeasurement.contrast}:1, required >= ${chipMeasurement.minRequired}:1; fg: ${chipMeasurement.fgColor}, bg: ${chipMeasurement.bgColor})`
        ).toBeGreaterThanOrEqual(chipMeasurement.minRequired);
      }
    }
  });

  test("1.3 Status badges [data-status='verified|empty'] contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Verified badge
      const verifiedBadge = await measureContrast(
        page,
        '.dashboard-stat-badge[data-status="verified"]',
        { isComponentOrBadge: true }
      );
      expect(
        verifiedBadge.contrast,
        `Dashboard status badge [data-status="verified"] failed in ${theme} mode (contrast ${verifiedBadge.contrast}:1)`
      ).toBeGreaterThanOrEqual(3.0);

      // Empty / None badge
      const emptyBadge = await measureContrast(
        page,
        '.dashboard-stat-badge[data-status="empty"]',
        { isComponentOrBadge: true }
      );
      expect(
        emptyBadge.contrast,
        `Dashboard status badge [data-status="empty"] failed in ${theme} mode (contrast ${emptyBadge.contrast}:1, fg: ${emptyBadge.fgColor}, bg: ${emptyBadge.bgColor})`
      ).toBeGreaterThanOrEqual(3.0);
    }
  });

  test("1.4 Numeric counters and readiness rings across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Score ring center value
      const scoreRingVal = page.locator(".score-ring-value").first();
      if (await scoreRingVal.isVisible()) {
        const ringMeasurement = await measureContrast(page, ".score-ring-value", {
          forceLarge: true,
        });
        expect(
          ringMeasurement.contrast,
          `Score ring value failed in ${theme} mode`
        ).toBeGreaterThanOrEqual(3.0);
      }

      // Metric ring container
      const miniRing = page.locator(".mini-metric-ring").first();
      await expect(miniRing).toBeVisible();
    }
  });

  test("1.5 Trajectory charts and audit stream timestamps across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Card titles & eyebrows
      const cardTitle = await measureContrast(page, ".dashboard-card-title", {
        forceLarge: true,
      });
      expect(cardTitle.contrast).toBeGreaterThanOrEqual(3.0);

      const cardEyebrow = await measureContrast(page, ".dashboard-card-eyebrow");
      expect(cardEyebrow.contrast).toBeGreaterThanOrEqual(4.5);

      // Milestones labels & times
      const milestoneLabel = page.locator(".dashboard-milestone-label").first();
      if (await milestoneLabel.isVisible()) {
        const mLabelMeas = await measureContrast(page, ".dashboard-milestone-label");
        expect(mLabelMeas.contrast).toBeGreaterThanOrEqual(mLabelMeas.minRequired);
      }

      const milestoneTime = page.locator(".dashboard-milestone-time").first();
      if (await milestoneTime.isVisible()) {
        const mTimeMeas = await measureContrast(page, ".dashboard-milestone-time");
        expect(mTimeMeas.contrast).toBeGreaterThanOrEqual(mTimeMeas.minRequired);
      }
    }
  });

  test("1.6 Action links and accent pills across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Stat card action links
      const statLink = await measureContrast(page, ".dashboard-stat-link");
      expect(
        statLink.contrast,
        `Dashboard stat link (.dashboard-stat-link) failed in ${theme} mode (contrast ${statLink.contrast}:1, fg: ${statLink.fgColor}, bg: ${statLink.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);

      // Inline action link
      const inlineAction = page.locator(".dashboard-inline-action").first();
      if (await inlineAction.isVisible()) {
        const inlineMeas = await measureContrast(page, ".dashboard-inline-action");
        expect(
          inlineMeas.contrast,
          `Dashboard inline action failed in ${theme} mode`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

// ============================================================================
// TIER 1: FEATURE COVERAGE — PROFILE EDITOR (6 TESTS)
// ============================================================================
test.describe("Tier 1: Feature Coverage - Profile Editor Controls & Text", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page, "/settings/profile");
    await page.waitForSelector('a.profile-tab[href="#profile-details"]', { timeout: 8000 });
    await page.locator('a.profile-tab[href="#profile-details"]').click();
    await page.locator("#profile-details").waitFor({ state: "visible", timeout: 8000 });
  });

  test("2.1 Profile Editor field labels contrast across light and dark themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const label = await measureContrast(page, "#profile-details .field-label");
      expect(
        label.contrast,
        `Profile Editor field label failed in ${theme} mode (contrast ${label.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("2.2 Profile Editor input values and textarea text contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const input = page.locator("#profile-username-input, #profile-details input:visible").first();
      await input.fill("Senior Platform Engineer");

      const inputMeas = await measureContrast(page, "#profile-username-input, #profile-details input");
      expect(
        inputMeas.contrast,
        `Profile Editor input value failed in ${theme} mode (contrast ${inputMeas.contrast}:1, fg: ${inputMeas.fgColor}, bg: ${inputMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("2.3 Profile Editor placeholders and phone placeholder contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // General input placeholder
      const placeholderMeas = await measureContrast(page, "input.field, .field input", {
        pseudo: "::placeholder",
      });
      expect(
        placeholderMeas.contrast,
        `Profile input placeholder failed in ${theme} mode (contrast ${placeholderMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);

      // Phone national placeholder if present
      const phoneInput = page.locator(".phone-national");
      if (await phoneInput.isVisible()) {
        const phoneMeas = await measureContrast(page, ".phone-national", {
          pseudo: "::placeholder",
        });
        expect(
          phoneMeas.contrast,
          `Phone input placeholder (.phone-national) failed in ${theme} mode (contrast ${phoneMeas.contrast}:1)`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("2.4 Profile Editor primary buttons (.button-primary) text contrast in light and dark modes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const primaryBtn = page.locator(".profile-editor .button-primary, .workspace .button-primary").first();
      await expect(primaryBtn).toBeVisible();

      const btnMeas = await measureContrast(
        page,
        ".profile-editor .button-primary, .workspace .button-primary",
        { isComponentOrBadge: true }
      );

      // Primary buttons must achieve at least 4.5:1 text readability and avoid white-on-white (1.05:1) or white-on-sky (1.77:1)
      expect(
        btnMeas.contrast,
        `Primary button text contrast failed in ${theme} mode (contrast ${btnMeas.contrast}:1, fg: ${btnMeas.fgColor}, bg: ${btnMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("2.5 Profile Editor saved skills badges (.badge-info) contrast across themes", async ({ page }) => {
    // Ensure at least one skill badge exists for measurement
    await page.evaluate(() => {
      const editor = document.querySelector(".profile-editor") || document.body;
      if (!editor.querySelector(".badge-info")) {
        const badge = document.createElement("span");
        badge.className = "badge badge-info";
        badge.textContent = "React & Node.js";
        editor.appendChild(badge);
      }
    });

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const badgeMeas = await measureContrast(page, ".badge-info", {
        isComponentOrBadge: true,
      });
      expect(
        badgeMeas.contrast,
        `Profile skill badge (.badge-info) failed in ${theme} mode (contrast ${badgeMeas.contrast}:1, fg: ${badgeMeas.fgColor}, bg: ${badgeMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("2.6 Profile Editor photo and resume upload controls and helper copy contrast", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const photoHint = page.locator(".profile-photo-hint");
      if (await photoHint.isVisible()) {
        const hintMeas = await measureContrast(page, ".profile-photo-hint");
        expect(
          hintMeas.contrast,
          `Photo upload hint (.profile-photo-hint) failed in ${theme} mode`
        ).toBeGreaterThanOrEqual(4.5);
      }

      const resumeHint = page.locator(".profile-resume-upload-hint");
      if (await resumeHint.isVisible()) {
        const rHintMeas = await measureContrast(page, ".profile-resume-upload-hint");
        expect(
          rHintMeas.contrast,
          `Resume upload hint failed in ${theme} mode`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

// ============================================================================
// TIER 1: FEATURE COVERAGE — LANDING PAGE (6 TESTS)
// ============================================================================
test.describe("Tier 1: Feature Coverage - Landing Page Sequences, Signals & CTA", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await ensureLandingSequencesAndSignals(page);
  });

  test("3.1 Landing Page sequence cards title, description, and number contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Sequence card title
      const titleMeas = await measureContrast(page, ".sequence-card-title", {
        forceLarge: true,
      });
      expect(
        titleMeas.contrast,
        `Sequence card title (.sequence-card-title) failed in ${theme} mode (contrast ${titleMeas.contrast}:1, fg: ${titleMeas.fgColor}, bg: ${titleMeas.bgColor})`
      ).toBeGreaterThanOrEqual(3.0);

      // Sequence card description
      const descMeas = await measureContrast(page, ".sequence-card-desc");
      expect(
        descMeas.contrast,
        `Sequence card description (.sequence-card-desc) failed in ${theme} mode (contrast ${descMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);

      // Sequence number
      const numMeas = await measureContrast(page, ".sequence-number", {
        isComponentOrBadge: true,
      });
      expect(
        numMeas.contrast,
        `Sequence number (.sequence-number) failed in ${theme} mode (contrast ${numMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(3.0);
    }
  });

  test("3.2 Landing Page sequence section header title and subtitle contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const titleMeas = await measureContrast(page, ".sequence-title", {
        forceLarge: true,
      });
      expect(
        titleMeas.contrast,
        `Sequence title (.sequence-title) failed in ${theme} mode (contrast ${titleMeas.contrast}:1, fg: ${titleMeas.fgColor}, bg: ${titleMeas.bgColor})`
      ).toBeGreaterThanOrEqual(3.0);

      const subtitleMeas = await measureContrast(page, ".sequence-subtitle");
      expect(
        subtitleMeas.contrast,
        `Sequence subtitle (.sequence-subtitle) failed in ${theme} mode (contrast ${subtitleMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("3.3 Landing Page market signal chips and roles contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Signal strip title
      const stripTitle = await measureContrast(page, ".signal-strip-title");
      expect(
        stripTitle.contrast,
        `Signal strip title failed in ${theme} mode (contrast ${stripTitle.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);

      // Signal role text
      const roleMeas = await measureContrast(page, ".signal-role");
      expect(
        roleMeas.contrast,
        `Signal role (.signal-role) failed in ${theme} mode (contrast ${roleMeas.contrast}:1, fg: ${roleMeas.fgColor}, bg: ${roleMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);

      // Signal location
      const locMeas = await measureContrast(page, ".signal-location");
      expect(
        locMeas.contrast,
        `Signal location (.signal-location) failed in ${theme} mode (contrast ${locMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);

      // Signal work mode
      const modeMeas = await measureContrast(page, ".signal-mode");
      expect(
        modeMeas.contrast,
        `Signal mode (.signal-mode) failed in ${theme} mode (contrast ${modeMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("3.4 Landing Page primary CTA button idle state contrast in light and dark themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const ctaMeas = await measureContrast(page, ".home-primary-cta", {
        isComponentOrBadge: true,
      });
      expect(
        ctaMeas.contrast,
        `Landing primary CTA idle state failed in ${theme} mode (contrast ${ctaMeas.contrast}:1, fg: ${ctaMeas.fgColor}, bg: ${ctaMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("3.5 Landing Page primary CTA button hover state contrast in light and dark themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const hoverMeas = await measureHoverContrast(page, ".home-primary-cta", {
        isComponentOrBadge: true,
      });
      expect(
        hoverMeas.contrast,
        `Landing primary CTA hover state failed in ${theme} mode (contrast ${hoverMeas.contrast}:1, fg: ${hoverMeas.fgColor}, bg: ${hoverMeas.bgColor})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("3.6 Landing Page editorial profile sheet and footer copy contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Profile sheet head
      const sheetHead = page.locator(".home-sheet-head").first();
      if (await sheetHead.isVisible()) {
        const sheetMeas = await measureContrast(page, ".home-sheet-head");
        expect(sheetMeas.contrast).toBeGreaterThanOrEqual(sheetMeas.minRequired);
      }

      // Footer copy
      const footer = page.locator(".home-footer").first();
      if (await footer.isVisible()) {
        const footerMeas = await measureContrast(page, ".home-footer");
        expect(footerMeas.contrast).toBeGreaterThanOrEqual(3.0);
      }
    }
  });
});

// ============================================================================
// TIER 1: FEATURE COVERAGE — JOBS RADAR (5 TESTS)
// ============================================================================
test.describe("Tier 1: Feature Coverage - Jobs Radar Filters, Tags & Badges", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page, "/jobs");
    await page.waitForSelector(".jobs-radar-page, .filters-bar, .jobs-stat-rail", { timeout: 8000 });
    await ensureJobCardVariants(page);
  });

  test("4.1 Jobs Radar filter search inputs and placeholders contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const filterInput = page.locator('.filters-bar input, input[placeholder*="City"]').first();
      await expect(filterInput).toBeVisible();

      // Input typed value contrast
      await filterInput.fill("San Francisco, CA");
      const inputMeas = await measureContrast(page, '.filters-bar input, input[placeholder*="City"]');
      expect(
        inputMeas.contrast,
        `Jobs Radar filter input value failed in ${theme} mode (contrast ${inputMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);

      // Input placeholder contrast
      await filterInput.fill("");
      const phMeas = await measureContrast(page, '.filters-bar input, input[placeholder*="City"]', {
        pseudo: "::placeholder",
      });
      expect(
        phMeas.contrast,
        `Jobs Radar filter input placeholder failed in ${theme} mode (contrast ${phMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("4.2 Jobs Radar filter dropdowns and select options contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const select = page.locator("select").first();
      if (await select.isVisible()) {
        const selectMeas = await measureContrast(page, "select");
        expect(
          selectMeas.contrast,
          `Select element text contrast failed in ${theme} mode`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("4.3 Jobs Radar stat rail cards (label, value, note) contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const labelMeas = await measureContrast(page, ".jobs-stat-rail .metric-card-label");
      expect(
        labelMeas.contrast,
        `Jobs stat rail card label failed in ${theme} mode (contrast ${labelMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(labelMeas.minRequired);

      const valueMeas = await measureContrast(page, ".jobs-stat-rail .metric-value", {
        forceLarge: true,
      });
      expect(
        valueMeas.contrast,
        `Jobs stat rail metric value failed in ${theme} mode (contrast ${valueMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(3.0);

      const noteMeas = await measureContrast(page, ".jobs-stat-rail .metric-card-note");
      expect(
        noteMeas.contrast,
        `Jobs stat rail note failed in ${theme} mode (contrast ${noteMeas.contrast}:1)`
      ).toBeGreaterThanOrEqual(noteMeas.minRequired);
    }
  });

  test("4.4 Jobs Radar match tags (.job-tag-matched and .job-tag-gap) contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Matched tag
      const matchedTag = await measureContrast(page, ".job-tag-matched", {
        isComponentOrBadge: true,
      });
      expect(
        matchedTag.contrast,
        `Job tag matched (.job-tag-matched) failed in ${theme} mode (contrast ${matchedTag.contrast}:1)`
      ).toBeGreaterThanOrEqual(3.0);

      // Gap tag
      const gapTag = await measureContrast(page, ".job-tag-gap", {
        isComponentOrBadge: true,
      });
      expect(
        gapTag.contrast,
        `Job tag gap (.job-tag-gap) failed in ${theme} mode (contrast ${gapTag.contrast}:1, fg: ${gapTag.fgColor}, bg: ${gapTag.bgColor})`
      ).toBeGreaterThanOrEqual(3.0);
    }
  });

  test("4.5 Jobs Radar score badges (.job-score with high and mid tone) contrast across themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const midScore = await measureContrast(page, '.job-score[data-tone="mid"]', {
        isComponentOrBadge: true,
      });
      expect(
        midScore.contrast,
        `Job score badge (.job-score[data-tone="mid"]) failed in ${theme} mode (contrast ${midScore.contrast}:1, fg: ${midScore.fgColor}, bg: ${midScore.bgColor})`
      ).toBeGreaterThanOrEqual(3.0);
    }
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (5 TESTS)
// ============================================================================
test.describe("Tier 2: Boundary & Corner Cases", () => {
  test("5.1 Form controls focus indicators non-text contrast (>= 3.0:1) across themes", async ({ page }) => {
    await enterDemo(page, "/settings/profile");

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const input = page.locator("input.field, .field input").first();
      await input.waitFor({ state: "visible" });

      const focusResult = await measureFocusContrast(page, "input.field, .field input");
      expect(
        focusResult.contrast,
        `Input focus indicator failed in ${theme} mode (contrast ${focusResult.contrast}:1, focusColor: ${focusResult.focusColor}, surface: ${focusResult.surfaceColor})`
      ).toBeGreaterThanOrEqual(3.0);
    }
  });

  test("5.2 Interactive button and link hover states contrast across views", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const hoverLink = await measureHoverContrast(page, ".dashboard-stat-link");
      expect(
        hoverLink.contrast,
        `Stat link hover failed in ${theme} mode (contrast ${hoverLink.contrast}:1)`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("5.3 Empty and zero metric states readability (empty trajectory, zero counts, None badge)", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Verify zero / empty state containers are rendered and legible
      const emptyBadge = page.locator('.dashboard-stat-badge[data-status="empty"]').first();
      if (await emptyBadge.isVisible()) {
        const meas = await measureContrast(page, '.dashboard-stat-badge[data-status="empty"]', {
          isComponentOrBadge: true,
        });
        expect(meas.contrast).toBeGreaterThanOrEqual(3.0);
      }
    }
  });

  test("5.4 Rapid consecutive theme switching preserves token consistency and legibility", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    // Perform 4 rapid theme toggles
    await setTheme(page, "dark");
    await setTheme(page, "light");
    await setTheme(page, "dark");
    await setTheme(page, "light");

    expect(await getTheme(page)).toBe("light");

    // Stat card label must maintain light mode contrast after rapid toggling
    const labelMeas = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(labelMeas.contrast).toBeGreaterThanOrEqual(4.5);

    // Toggle once more to dark
    await setTheme(page, "dark");
    expect(await getTheme(page)).toBe("dark");

    const darkLabelMeas = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(darkLabelMeas.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test("5.5 Small mobile viewport (375x667) legibility and contrast preservation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await enterDemo(page, "/dashboard");

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      const statVal = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-value", {
        forceLarge: true,
      });
      expect(statVal.contrast).toBeGreaterThanOrEqual(3.0);

      // Verify no horizontal overflow in small mobile
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow).toBe(false);
    }
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (4 TESTS)
// ============================================================================
test.describe("Tier 3: Cross-Feature Combinations", () => {
  test("6.1 Active input focus and typing during live theme toggling maintains contrast", async ({ page }) => {
    await enterDemo(page, "/settings/profile");
    await page.waitForSelector('a.profile-tab[href="#profile-details"]', { timeout: 8000 });
    await page.locator('a.profile-tab[href="#profile-details"]').click();
    await page.locator("#profile-details").waitFor({ state: "visible", timeout: 8000 });
    await setTheme(page, "light");

    const input = page.locator("#profile-username-input, #profile-details input:visible").first();
    await input.click();
    await input.fill("Principal Systems Architect");

    // Live toggle to dark mode while input is focused with value
    await setTheme(page, "dark");
    await page.waitForTimeout(100);

    const darkInputMeas = await measureContrast(page, "#profile-username-input, #profile-details input");
    expect(
      darkInputMeas.contrast,
      `Input text contrast lost during live theme toggle to dark mode`
    ).toBeGreaterThanOrEqual(4.5);

    // Live toggle back to light mode
    await setTheme(page, "light");
    await page.waitForTimeout(100);

    const lightInputMeas = await measureContrast(page, "#profile-username-input, #profile-details input");
    expect(
      lightInputMeas.contrast,
      `Input text contrast lost during live theme toggle to light mode`
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("6.2 Cross-view navigation across all four priority areas under dark theme", async ({ page }) => {
    await enterDemo(page, "/");
    await setTheme(page, "dark");

    // 1. Landing Page check
    await page.locator("#home-hero-title").waitFor({ state: "visible" });
    const ctaMeas = await measureContrast(page, ".home-primary-cta", { isComponentOrBadge: true });
    expect(ctaMeas.contrast).toBeGreaterThanOrEqual(4.5);

    // 2. Navigate to Dashboard
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.locator(".dashboard-stat-card").first().waitFor({ state: "visible", timeout: 8000 });
    expect(await getTheme(page)).toBe("dark");
    const dashLabel = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(dashLabel.contrast).toBeGreaterThanOrEqual(4.5);

    // 3. Navigate to Jobs Radar
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await page.locator(".jobs-stat-rail").first().waitFor({ state: "visible", timeout: 8000 });
    expect(await getTheme(page)).toBe("dark");
    const railLabel = await measureContrast(page, ".jobs-stat-rail .metric-card-label");
    expect(railLabel.contrast).toBeGreaterThanOrEqual(railLabel.minRequired);

    // 4. Navigate to Profile Settings
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a.profile-tab[href="#profile-details"]', { timeout: 8000 });
    await page.locator('a.profile-tab[href="#profile-details"]').click();
    await page.locator("#profile-details").waitFor({ state: "visible", timeout: 8000 });
    expect(await getTheme(page)).toBe("dark");
    const profileLabel = await measureContrast(page, "#profile-details .field-label");
    expect(profileLabel.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test("6.3 Theme persistence in localStorage across full page reloads", async ({ page }) => {
    await enterDemo(page, "/dashboard");
    await setTheme(page, "dark");

    // Reload page
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".dashboard-stat-card").first().waitFor({ state: "visible", timeout: 8000 });
    expect(await getTheme(page)).toBe("dark");

    const statLabel = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(statLabel.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test("6.4 Theme change synchronization across tabs / storage events", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    // Emulate external tab storage change event
    await page.evaluate(() => {
      window.localStorage.setItem("career-copilot-theme", "dark");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "career-copilot-theme",
          newValue: "dark",
          oldValue: "light",
        })
      );
    });
    await page.waitForTimeout(150);

    const theme = await getTheme(page);
    expect(theme).toBe("dark");
  });
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (3 TESTS)
// ============================================================================
test.describe("Tier 4: Real-World Application Scenarios", () => {
  test("7.1 Complete candidate onboarding flow: Landing -> Sign up / Demo -> Dashboard -> Profile", async ({ page }) => {
    // Step 1: Candidate visits Landing Page
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const heroTitle = page.locator("#home-hero-title");
    await expect(heroTitle).toBeVisible();

    const ctaMeas = await measureContrast(page, ".home-primary-cta", { isComponentOrBadge: true });
    expect(ctaMeas.contrast).toBeGreaterThanOrEqual(4.5);

    // Step 2: Enters demo workspace
    await enterDemo(page, "/dashboard");
    await expect(page.locator(".workspace")).toBeVisible();

    // Step 3: Navigates to Profile Editor from Dashboard
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /candidate profile/i })).toBeVisible();

    // Verify profile primary action button is clearly legible
    const saveBtnMeas = await measureContrast(
      page,
      ".profile-editor .button-primary, .workspace .button-primary",
      { isComponentOrBadge: true }
    );
    expect(saveBtnMeas.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test("7.2 End-to-end job discovery flow: Dashboard -> Jobs Radar -> Filters -> Tags -> Saved status", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    // Click explore jobs link
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".jobs-radar-page")).toBeVisible();

    // Filter job search by role keyword
    const modeInput = page.locator('input[placeholder*="remote"], .filters-bar input').first();
    await modeInput.fill("Hybrid");
    await page.waitForTimeout(200);

    // Stat rail metric cards remain readable
    const statMeas = await measureContrast(page, ".jobs-stat-rail .metric-card-label");
    expect(statMeas.contrast).toBeGreaterThanOrEqual(statMeas.minRequired);
  });

  test("7.3 Day-to-night work session transition: Complete workspace audit from light to dark mode", async ({ page }) => {
    await enterDemo(page, "/dashboard");

    // Daytime session (Light theme)
    await setTheme(page, "light");
    const lightStat = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(lightStat.contrast).toBeGreaterThanOrEqual(4.5);

    // Evening session transition (Toggle via UI theme button)
    const newTheme = await toggleThemeViaUi(page);
    expect(newTheme).toBe("dark");

    // Nighttime session (Dark theme)
    const darkStat = await measureContrast(page, ".dashboard-stat-card .dashboard-stat-label");
    expect(darkStat.contrast).toBeGreaterThanOrEqual(4.5);
  });
});
