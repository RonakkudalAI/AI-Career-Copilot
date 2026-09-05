import type { Page } from "@playwright/test";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ContrastMeasurement {
  selector: string;
  text: string;
  fgColor: string;
  bgColor: string;
  lForeground: number;
  lBackground: number;
  contrast: number;
  fontSize: string;
  fontWeight: string;
  isLargeText: boolean;
  minRequired: number;
  passes: boolean;
}

export interface FocusMeasurement {
  selector: string;
  focusColor: string;
  surfaceColor: string;
  lFocus: number;
  lSurface: number;
  contrast: number;
  minRequired: number;
  passes: boolean;
}

/**
 * Enters Demo mode with career_copilot_demo cookie and navigates to the given path.
 */
export async function enterDemo(page: Page, path: string = "/dashboard"): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.context().addCookies([
    { name: "career_copilot_demo", value: "1", url: new URL(page.url()).origin },
  ]);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
}

/**
 * Sets the theme directly via DOM attribute, storage, and theme change event.
 */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((themeName) => {
    window.localStorage.setItem("career-copilot-theme", themeName);
    document.documentElement.setAttribute("data-theme", themeName);
    document.documentElement.style.colorScheme = themeName;
    window.dispatchEvent(new Event("career-copilot:theme-change"));
  }, theme);
  await page.waitForTimeout(150);
}

/**
 * Toggles theme via UI button click.
 */
export async function toggleThemeViaUi(page: Page): Promise<string> {
  const directToggle = page.locator(".theme-toggle, .theme-toggle-compact").first();
  if (await directToggle.isVisible()) {
    await directToggle.click();
  } else {
    const profileCard = page.locator(".sidebar-profile-card").first();
    if (await profileCard.isVisible()) {
      await profileCard.click();
      await page.waitForTimeout(150);
      const menuToggle = page.locator(".theme-menu-item .theme-toggle, .sidebar-account-menu .theme-toggle").first();
      if (await menuToggle.isVisible()) {
        await menuToggle.click();
      } else {
        const current = await getTheme(page);
        await setTheme(page, current === "light" ? "dark" : "light");
      }
    } else {
      const current = await getTheme(page);
      await setTheme(page, current === "light" ? "dark" : "light");
    }
  }
  await page.waitForTimeout(200);
  return getTheme(page);
}

/**
 * Gets the current active theme from documentElement data-theme attribute.
 */
export async function getTheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
}

/**
 * Standalone calculation of relative luminance given RGB values (0-255).
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B with sRGB decompression.
 */
export function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const channel = (val: number) => {
    const c = val / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Standalone contrast ratio calculation: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.
 */
export function calculateContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Evaluates text contrast against effective background in the browser DOM.
 */
export async function measureContrast(
  page: Page,
  selector: string,
  options: {
    pseudo?: string;
    isComponentOrBadge?: boolean;
    forceLarge?: boolean;
  } = {}
): Promise<ContrastMeasurement> {
  return page.evaluate(
    ({ sel, opts }) => {
      interface RGBA {
        r: number;
        g: number;
        b: number;
        a: number;
      }

      function parseRgba(str: string): RGBA {
        const trimmed = (str || "").trim().toLowerCase();
        if (!trimmed || trimmed === "transparent" || trimmed === "inherit" || trimmed === "initial") {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        if (trimmed.startsWith("rgba")) {
          const m = trimmed.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
          if (m) {
            return {
              r: parseFloat(m[1]),
              g: parseFloat(m[2]),
              b: parseFloat(m[3]),
              a: parseFloat(m[4]),
            };
          }
        }
        if (trimmed.startsWith("rgb")) {
          const m = trimmed.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
          if (m) {
            return {
              r: parseFloat(m[1]),
              g: parseFloat(m[2]),
              b: parseFloat(m[3]),
              a: 1,
            };
          }
        }
        if (trimmed.startsWith("#")) {
          let hex = trimmed.slice(1);
          if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
          if (hex.length === 6) {
            return {
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16),
              a: 1,
            };
          }
          if (hex.length === 8) {
            return {
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16),
              a: parseInt(hex.slice(6, 8), 16) / 255,
            };
          }
        }
        if (trimmed === "white") return { r: 255, g: 255, b: 255, a: 1 };
        if (trimmed === "black") return { r: 0, g: 0, b: 0, a: 1 };

        // Fallback to DOM canvas to accurately parse modern CSS color syntax (color-mix, color(srgb ...), lab, etc.)
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = str;
            ctx.fillRect(0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
          }
        } catch {
          // ignore
        }
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      function blendOver(top: RGBA, bottom: RGBA): RGBA {
        const a = top.a + bottom.a * (1 - top.a);
        if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
        const r = Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a);
        const g = Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a);
        const b = Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a);
        return { r, g, b, a };
      }

      function getEffectiveBackground(el: HTMLElement): RGBA {
        let curr: HTMLElement | null = el;
        const stack: RGBA[] = [];

        while (curr) {
          const cs = window.getComputedStyle(curr);
          const bg = parseRgba(cs.backgroundColor);
          if (bg.a > 0) {
            stack.push(bg);
            if (bg.a === 1) break;
          }
          curr = curr.parentElement;
        }

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        let base: RGBA = isDark ? { r: 17, g: 28, b: 45, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };

        for (let i = stack.length - 1; i >= 0; i--) {
          base = blendOver(stack[i], base);
        }
        return base;
      }

      function channelLuminance(val: number): number {
        const c = val / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      }

      function relativeLuminance(rgba: RGBA): number {
        return (
          0.2126 * channelLuminance(rgba.r) +
          0.7152 * channelLuminance(rgba.g) +
          0.0722 * channelLuminance(rgba.b)
        );
      }

      const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      if (!candidates.length) {
        throw new Error(`measureContrast: Element not found for selector "${sel}"`);
      }
      let el: HTMLElement = candidates[0];
      for (const cand of candidates) {
        const style = window.getComputedStyle(cand);
        const rect = cand.getBoundingClientRect();
        if (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          (rect.width > 0 || rect.height > 0 || cand.getClientRects().length > 0)
        ) {
          el = cand;
          break;
        }
      }

      const cs = opts.pseudo ? window.getComputedStyle(el, opts.pseudo) : window.getComputedStyle(el);
      const bgRgba = getEffectiveBackground(el);

      let fgRgba = parseRgba(cs.color);
      const elementOpacity = parseFloat(cs.opacity || "1");
      if (elementOpacity < 1) {
        fgRgba = blendOver({ ...fgRgba, a: fgRgba.a * elementOpacity }, bgRgba);
      }

      const lFg = relativeLuminance(fgRgba);
      const lBg = relativeLuminance(bgRgba);

      const lighter = Math.max(lFg, lBg);
      const darker = Math.min(lFg, lBg);
      const contrast = Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));

      const fontSize = cs.fontSize || "16px";
      const fontSizePx = parseFloat(fontSize) || 16;
      const fontWeight = cs.fontWeight || "400";
      const isBold = parseInt(fontWeight, 10) >= 700 || fontWeight === "bold";

      const isLargeText =
        Boolean(opts.forceLarge) || fontSizePx >= 24 || (fontSizePx >= 18.66 && isBold);

      const minRequired = opts.isComponentOrBadge || isLargeText ? 3.0 : 4.5;
      const passes = contrast >= minRequired;

      return {
        selector: sel,
        text: (el.textContent || "").trim().slice(0, 40),
        fgColor: `rgba(${fgRgba.r}, ${fgRgba.g}, ${fgRgba.b}, ${fgRgba.a})`,
        bgColor: `rgba(${bgRgba.r}, ${bgRgba.g}, ${bgRgba.b}, ${bgRgba.a})`,
        lForeground: Number(lFg.toFixed(4)),
        lBackground: Number(lBg.toFixed(4)),
        contrast,
        fontSize,
        fontWeight,
        isLargeText,
        minRequired,
        passes,
      };
    },
    { sel: selector, opts: options }
  );
}

/**
 * Evaluates focus indicator contrast (outline, border, or box-shadow ring) against adjacent surface.
 * SC 1.4.11 requires >= 3.0:1 non-text contrast for interactive focus states.
 */
export async function measureFocusContrast(
  page: Page,
  selector: string
): Promise<FocusMeasurement> {
  const visibleLoc = page.locator(selector).locator("visible=true").first();
  if (await visibleLoc.isVisible()) {
    await visibleLoc.focus();
  } else {
    await page.locator(selector).first().focus();
  }
  await page.waitForTimeout(100);

  return page.evaluate((sel) => {
    interface RGBA {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    function parseRgba(str: string): RGBA {
      const trimmed = (str || "").trim().toLowerCase();
      if (!trimmed || trimmed === "transparent" || trimmed === "inherit" || trimmed === "initial") {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      if (trimmed.startsWith("rgba")) {
        const m = trimmed.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
        if (m) {
          return {
            r: parseFloat(m[1]),
            g: parseFloat(m[2]),
            b: parseFloat(m[3]),
            a: parseFloat(m[4]),
          };
        }
      }
      if (trimmed.startsWith("rgb")) {
        const m = trimmed.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
        if (m) {
          return {
            r: parseFloat(m[1]),
            g: parseFloat(m[2]),
            b: parseFloat(m[3]),
            a: 1,
          };
        }
      }
      if (trimmed.startsWith("#")) {
        let hex = trimmed.slice(1);
        if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
        if (hex.length === 6) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1,
          };
        }
        if (hex.length === 8) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: parseInt(hex.slice(6, 8), 16) / 255,
          };
        }
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = str;
          ctx.fillRect(0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
        }
      } catch {
        // ignore
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    function channelLuminance(val: number): number {
      const c = val / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function relativeLuminance(rgba: RGBA): number {
      return (
        0.2126 * channelLuminance(rgba.r) +
        0.7152 * channelLuminance(rgba.g) +
        0.0722 * channelLuminance(rgba.b)
      );
    }

    const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    if (!candidates.length) throw new Error(`Element ${sel} not found`);
    let el: HTMLElement = candidates[0];
    for (const cand of candidates) {
      const style = window.getComputedStyle(cand);
      const rect = cand.getBoundingClientRect();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        (rect.width > 0 || rect.height > 0 || cand.getClientRects().length > 0)
      ) {
        el = cand;
        break;
      }
    }

    const cs = window.getComputedStyle(el);
    const parentCs = el.parentElement ? window.getComputedStyle(el.parentElement) : cs;

    let focusColorStr = cs.outlineColor;
    if (!focusColorStr || focusColorStr === "transparent" || cs.outlineStyle === "none") {
      focusColorStr = cs.borderColor;
    }

    const surfaceRgba = parseRgba(parentCs.backgroundColor || cs.backgroundColor || "white");
    const focusRgba = parseRgba(focusColorStr);

    const lFocus = relativeLuminance(focusRgba);
    const lSurface = relativeLuminance(surfaceRgba);

    const lighter = Math.max(lFocus, lSurface);
    const darker = Math.min(lFocus, lSurface);
    const contrast = Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));

    const minRequired = 3.0;
    const passes = contrast >= minRequired;

    return {
      selector: sel,
      focusColor: `rgba(${focusRgba.r}, ${focusRgba.g}, ${focusRgba.b}, ${focusRgba.a})`,
      surfaceColor: `rgba(${surfaceRgba.r}, ${surfaceRgba.g}, ${surfaceRgba.b}, ${surfaceRgba.a})`,
      lFocus: Number(lFocus.toFixed(4)),
      lSurface: Number(lSurface.toFixed(4)),
      contrast,
      minRequired,
      passes,
    };
  }, selector);
}

/**
 * Measures hover state contrast on a target element.
 */
export async function measureHoverContrast(
  page: Page,
  selector: string,
  options: { isComponentOrBadge?: boolean } = {}
): Promise<ContrastMeasurement> {
  const locator = page.locator(selector).first();
  await locator.hover();
  await page.waitForTimeout(100);
  return measureContrast(page, selector, options);
}

/**
 * Injects canonical Landing Page sequence & signal test components into document
 * if not already statically rendered, allowing E2E contrast evaluation against globals.css rules.
 */
export async function ensureLandingSequencesAndSignals(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.querySelector(".sequence-section")) return;

    const container = document.createElement("div");
    container.id = "e2e-landing-test-suite-fixture";
    container.innerHTML = `
      <section class="signal-strip-section">
        <div class="signal-strip-header">
          <p class="signal-strip-title">MARKET SIGNALS</p>
        </div>
        <div class="signal-strip-rail">
          <div class="signal-strip-track">
            <div class="signal-items-group">
              <div class="signal-chip-item">
                <span class="signal-role">Senior Systems Architect</span>
                <span class="signal-sep">·</span>
                <span class="signal-location">Bengaluru</span>
                <span class="signal-mode">Hybrid</span>
                <span class="signal-skill-tag">Distributed Systems</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="sequence-section">
        <div class="sequence-header">
          <h2 class="sequence-title">The Career Trajectory</h2>
          <p class="sequence-subtitle">From raw evidence to high-conviction offers</p>
        </div>
        <div class="sequence-timeline">
          <div class="sequence-checkpoints">
            <div class="sequence-checkpoint-row align-left">
              <div class="sequence-card">
                <div class="sequence-card-header">
                  <span class="sequence-number">01</span>
                  <span class="sequence-verb-badge">Map</span>
                </div>
                <h3 class="sequence-card-title">Extract Signal from Noise</h3>
                <p class="sequence-card-desc">Every commit and architectural decision converted into verifiable artifacts.</p>
                <div class="sequence-visual-chip">Evidence verified</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
    const main = document.querySelector("main") || document.body;
    main.appendChild(container);
  });
  await page.waitForTimeout(100);
}

/**
 * Ensures all three delta chip tones (up, down, flat) and status badge variants (verified, empty)
 * exist inside .dashboard-stat-card on /dashboard so the CSS rules are comprehensively tested.
 */
export async function ensureDashboardStatVariants(page: Page): Promise<void> {
  await page.evaluate(() => {
    const statCards = document.querySelectorAll(".dashboard-stat-card");
    if (!statCards.length) return;

    // Ensure delta chip variants exist in Stat Card 2
    const card2ValRow = statCards[1]?.querySelector(".dashboard-stat-value-row");
    if (card2ValRow) {
      if (!card2ValRow.querySelector('.dashboard-delta-chip[data-tone="up"]')) {
        const upChip = document.createElement("span");
        upChip.className = "dashboard-delta-chip";
        upChip.setAttribute("data-tone", "up");
        upChip.textContent = "+12";
        card2ValRow.appendChild(upChip);
      }
      if (!card2ValRow.querySelector('.dashboard-delta-chip[data-tone="down"]')) {
        const downChip = document.createElement("span");
        downChip.className = "dashboard-delta-chip";
        downChip.setAttribute("data-tone", "down");
        downChip.textContent = "-5";
        card2ValRow.appendChild(downChip);
      }
      if (!card2ValRow.querySelector('.dashboard-delta-chip[data-tone="flat"]')) {
        const flatChip = document.createElement("span");
        flatChip.className = "dashboard-delta-chip";
        flatChip.setAttribute("data-tone", "flat");
        flatChip.textContent = "0";
        card2ValRow.appendChild(flatChip);
      }
    }

    // Ensure status badge variants exist in Stat Card 3
    const card3Header = statCards[2]?.querySelector(".dashboard-stat-header");
    if (card3Header) {
      if (!card3Header.querySelector('.dashboard-stat-badge[data-status="verified"]')) {
        const vBadge = document.createElement("span");
        vBadge.className = "dashboard-stat-badge";
        vBadge.setAttribute("data-status", "verified");
        vBadge.textContent = "Verified";
        card3Header.appendChild(vBadge);
      }
      if (!card3Header.querySelector('.dashboard-stat-badge[data-status="empty"]')) {
        const eBadge = document.createElement("span");
        eBadge.className = "dashboard-stat-badge";
        eBadge.setAttribute("data-status", "empty");
        eBadge.textContent = "None";
        card3Header.appendChild(eBadge);
      }
    }
  });
  await page.waitForTimeout(100);
}

/**
 * Ensures job score and tag variants (high, mid, low tones, matched & gap tags)
 * exist on the Jobs page for comprehensive WCAG evaluation.
 */
export async function ensureJobCardVariants(page: Page): Promise<void> {
  await page.evaluate(() => {
    const jobCards = document.querySelectorAll(".job-card");
    if (!jobCards.length) return;

    const firstCard = jobCards[0];
    const top = firstCard.querySelector(".job-card-top");
    if (top && !firstCard.querySelector('.job-score[data-tone="mid"]')) {
      const midScore = document.createElement("div");
      midScore.className = "job-score";
      midScore.setAttribute("data-tone", "mid");
      midScore.innerHTML = '<span class="job-score-value">68%</span><span class="job-score-label">match</span>';
      top.insertBefore(midScore, top.firstChild);
    }

    let tagsContainer = firstCard.querySelector(".job-card-tags");
    if (!tagsContainer) {
      tagsContainer = document.createElement("div");
      tagsContainer.className = "job-card-tags";
      firstCard.appendChild(tagsContainer);
    }

    if (!tagsContainer.querySelector(".job-tag-matched")) {
      const matchedTag = document.createElement("span");
      matchedTag.className = "job-tag job-tag-matched";
      matchedTag.textContent = "TypeScript";
      tagsContainer.appendChild(matchedTag);
    }

    if (!tagsContainer.querySelector(".job-tag-gap")) {
      const gapTag = document.createElement("span");
      gapTag.className = "job-tag job-tag-gap";
      gapTag.textContent = "Kubernetes";
      tagsContainer.appendChild(gapTag);
    }
  });
  await page.waitForTimeout(100);
}
