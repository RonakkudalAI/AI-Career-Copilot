// Empirical WCAG AA Color Contrast Verification Script
// Mathematical reference:
// L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
// Contrast Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r, g, b) {
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseHex(hex) {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: 1.0,
    };
  }
  if (clean.length === 8) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: parseInt(clean.slice(6, 8), 16) / 255,
    };
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

export function mixSrgb(c1, p1, c2, p2) {
  // CSS color-mix(in srgb, c1 p1%, c2 p2%)
  // When p2 is omitted, p2 = 1 - p1
  const w1 = p1;
  const w2 = p2 !== undefined ? p2 : 1 - p1;
  const sum = w1 + w2;
  const normW1 = w1 / sum;
  const normW2 = w2 / sum;

  return {
    r: Math.round(c1.r * normW1 + c2.r * normW2),
    g: Math.round(c1.g * normW1 + c2.g * normW2),
    b: Math.round(c1.b * normW1 + c2.b * normW2),
    a: c1.a * normW1 + c2.a * normW2,
  };
}

export function blendOver(fg, bg) {
  // Alpha composite fg over bg
  const alpha = fg.a;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1.0,
  };
}

// Token dictionaries for light and dark modes
export const THEMES = {
  light: {
    background: parseHex("#f5faff"),
    surface: parseHex("#ffffff"),
    border: parseHex("#d4e2ee"),
    borderStrong: parseHex("#a8c4dc"),
    primary: parseHex("#1769aa"),
    primaryHover: parseHex("#125388"),
    primarySoft: parseHex("#e3f2fd"),
    primaryStrong: parseHex("#0d47a1"),
    primaryContrast: parseHex("#ffffff"),
    primaryDeep: parseHex("#0b2942"),
    secondary: parseHex("#526b80"),
    accent: parseHex("#3da2ff"),
    accentLink: parseHex("#1769aa"),
    text: parseHex("#0b2942"),
    textSecondary: parseHex("#526b80"),
    muted: parseHex("#526b80"),
    focus: parseHex("#1769aa"),
    textLink: parseHex("#1769aa"),
    textLinkHover: parseHex("#0d47a1"),
    textOnPrimary: parseHex("#ffffff"),
    success: parseHex("#2f7d57"),
    warning: parseHex("#c9992e"),
    textOnWarning: parseHex("#3d2a00"),
    warningBadgeText: parseHex("#3d2a00"),
    destructive: parseHex("#b91c1c"),
    textInverse: parseHex("#ffffff"),
  },
  dark: {
    background: parseHex("#0b1220"),
    surface: parseHex("#111c2d"),
    border: parseHex("#304a65"),
    borderStrong: parseHex("#5d7c9a"),
    primary: parseHex("#73b7f5"),
    primaryHover: parseHex("#b0dcff"),
    primarySoft: parseHex("#183a5b"),
    primaryStrong: parseHex("#8bc8ff"),
    primaryContrast: parseHex("#071635"),
    primaryDeep: parseHex("#d7ebff"),
    secondary: parseHex("#a8bbcf"),
    accent: parseHex("#72c0ff"),
    accentLink: parseHex("#72c0ff"),
    text: parseHex("#f5f5f0"),
    textSecondary: parseHex("#c0d0df"),
    muted: parseHex("#b4c6d6"),
    focus: parseHex("#a8d8ff"),
    textLink: parseHex("#a8d8ff"),
    textLinkHover: parseHex("#d5edff"),
    textOnPrimary: parseHex("#071635"),
    success: parseHex("#72d39a"),
    warning: parseHex("#f0c66a"),
    textOnWarning: parseHex("#1c1917"),
    warningBadgeText: parseHex("#fef08a"),
    destructive: parseHex("#f87171"),
    textInverse: parseHex("#0b1220"),
  },
};

export const TEST_CASES = [
  // 1. Dashboard stat links & action links
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-stat-link",
    theme: "light",
    getFg: (t) => t.textLink,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Link in stat card",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-stat-link (hover)",
    theme: "light",
    getFg: (t) => t.textLinkHover,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Link in stat card hover",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-stat-link",
    theme: "dark",
    getFg: (t) => t.textLink,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Link in stat card dark",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-stat-link (hover)",
    theme: "dark",
    getFg: (t) => t.textLinkHover,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Link in stat card hover dark",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-inline-action",
    theme: "light",
    getFg: (t) => t.textLink,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Inline action link light",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-inline-action (hover)",
    theme: "light",
    getFg: (t) => t.textLinkHover,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Inline action link hover light",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-inline-action",
    theme: "dark",
    getFg: (t) => t.textLink,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Inline action link dark",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-inline-action (hover)",
    theme: "dark",
    getFg: (t) => t.textLinkHover,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Inline action link hover dark",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-badge-pill",
    theme: "light",
    getFg: (t) => t.textLink,
    // in .dashboard-next-step-card: background is color-mix(in srgb, var(--accent) 7%, var(--surface))
    getBg: (t) => mixSrgb(t.accent, 0.07, t.surface, 0.93),
    minRequired: 4.5,
    type: "normal-text",
    note: "Next step badge pill in light banner",
  },
  {
    category: "Dashboard Links & Actions",
    element: ".dashboard-badge-pill",
    theme: "dark",
    getFg: (t) => t.textLink,
    getBg: (t) => mixSrgb(t.accent, 0.07, t.surface, 0.93),
    minRequired: 4.5,
    type: "normal-text",
    note: "Next step badge pill in dark banner",
  },

  // 2. Dashboard Delta Chips
  {
    category: "Dashboard Delta Chips",
    element: '.dashboard-delta-chip[data-tone="down"]',
    theme: "light",
    getFg: (t) => t.destructive,
    // background: var(--destructive-bg) = color-mix(in srgb, var(--destructive) 12%, transparent) over surface
    getBg: (t) => mixSrgb(t.destructive, 0.12, t.surface, 0.88),
    minRequired: 4.5,
    type: "normal-text",
    note: "Negative delta chip in light mode",
  },
  {
    category: "Dashboard Delta Chips",
    element: '.dashboard-delta-chip[data-tone="down"]',
    theme: "dark",
    getFg: (t) => t.destructive,
    // background: var(--destructive-bg) = color-mix(in srgb, var(--destructive) 20%, transparent) over surface
    getBg: (t) => mixSrgb(t.destructive, 0.2, t.surface, 0.8),
    minRequired: 4.5,
    type: "normal-text",
    note: "Negative delta chip in dark mode",
  },
  {
    category: "Dashboard Delta Chips",
    element: '.dashboard-delta-chip[data-tone="up"]',
    theme: "light",
    getFg: () => parseHex("#166534"),
    getBg: (t) => mixSrgb(t.success, 0.14, t.surface, 0.86),
    minRequired: 4.5,
    type: "normal-text",
    note: "Positive delta chip in light mode (#166534)",
  },
  {
    category: "Dashboard Delta Chips",
    element: '.dashboard-delta-chip[data-tone="up"]',
    theme: "dark",
    getFg: (t) => t.success,
    getBg: (t) => mixSrgb(t.success, 0.16, t.surface, 0.84),
    minRequired: 4.5,
    type: "normal-text",
    note: "Positive delta chip in dark mode (var(--success))",
  },

  // 3. Dashboard Stat Badges
  {
    category: "Dashboard Stat Badges",
    element: '.dashboard-stat-badge[data-status="empty"]',
    theme: "light",
    getFg: (t) => t.warningBadgeText,
    getBg: (t) => mixSrgb(t.warning, 0.15, t.surface, 0.85),
    minRequired: 4.5,
    type: "normal-text",
    note: "Empty/None status badge in light mode",
  },
  {
    category: "Dashboard Stat Badges",
    element: '.dashboard-stat-badge[data-status="empty"]',
    theme: "dark",
    getFg: (t) => t.warning,
    getBg: (t) => mixSrgb(t.warning, 0.16, t.surface, 0.84),
    minRequired: 4.5,
    type: "normal-text",
    note: "Empty/None status badge in dark mode",
  },
  {
    category: "Dashboard Stat Badges",
    element: '.dashboard-stat-badge[data-status="verified"]',
    theme: "light",
    getFg: () => parseHex("#166534"),
    getBg: (t) => mixSrgb(t.success, 0.14, t.surface, 0.86),
    minRequired: 4.5,
    type: "normal-text",
    note: "Verified status badge in light mode",
  },
  {
    category: "Dashboard Stat Badges",
    element: '.dashboard-stat-badge[data-status="verified"]',
    theme: "dark",
    getFg: (t) => t.success,
    getBg: (t) => mixSrgb(t.success, 0.16, t.surface, 0.84),
    minRequired: 4.5,
    type: "normal-text",
    note: "Verified status badge in dark mode",
  },

  // 4. Profile Editor Primary Button
  {
    category: "Profile Editor Buttons",
    element: ".profile-editor .button-primary",
    theme: "light",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryStrong,
    minRequired: 4.5,
    type: "normal-text",
    note: "Primary button in light mode (#ffffff on #0d47a1)",
  },
  {
    category: "Profile Editor Buttons",
    element: ".profile-editor .button-primary (hover)",
    theme: "light",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryHover,
    minRequired: 4.5,
    type: "normal-text",
    note: "Primary button hover in light mode (#ffffff on #125388)",
  },
  {
    category: "Profile Editor Buttons",
    element: ".profile-editor .button-primary",
    theme: "dark",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryStrong,
    minRequired: 4.5,
    type: "normal-text",
    note: "Primary button in dark mode (#071635 on #8bc8ff)",
  },
  {
    category: "Profile Editor Buttons",
    element: ".profile-editor .button-primary (hover)",
    theme: "dark",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryHover,
    minRequired: 4.5,
    type: "normal-text",
    note: "Primary button hover in dark mode (#071635 on #b0dcff)",
  },
  {
    category: "Profile Editor Buttons",
    element: ".workspace .feature-page.settings-page .button-primary:hover",
    theme: "light",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryHover,
    minRequired: 4.5,
    type: "normal-text",
    note: "Settings page primary button hover light",
  },
  {
    category: "Profile Editor Buttons",
    element: ".workspace .feature-page.settings-page .button-primary:hover",
    theme: "dark",
    getFg: (t) => t.textOnPrimary,
    getBg: (t) => t.primaryHover,
    minRequired: 4.5,
    type: "normal-text",
    note: "Settings page primary button hover dark",
  },

  // 5. Landing Page CTA Hover in Dark Mode
  {
    category: "Landing CTA",
    element: ".home-primary-cta:hover",
    theme: "dark",
    getFg: (t) => t.primaryContrast,
    getBg: (t) => t.primaryDeep,
    minRequired: 4.5,
    type: "normal-text",
    note: "Landing primary CTA hover in dark mode (#071635 on #d7ebff)",
  },
  {
    category: "Landing CTA",
    element: ".home-primary-cta:hover",
    theme: "light",
    getFg: (t) => t.textInverse,
    getBg: (t) => t.primaryDeep,
    minRequired: 4.5,
    type: "normal-text",
    note: "Landing primary CTA hover in light mode (#ffffff on #0b2942)",
  },

  // 6. Landing Sequences & Signals
  {
    category: "Landing Sequences & Signals",
    element: ".sequence-title",
    theme: "light",
    getFg: (t) => t.text,
    getBg: (t) => t.background,
    minRequired: 3.0, // large heading >= 24px
    type: "large-text",
    note: "Sequence section heading light",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".sequence-title",
    theme: "dark",
    getFg: (t) => t.text,
    getBg: (t) => t.background,
    minRequired: 3.0, // large heading >= 24px
    type: "large-text",
    note: "Sequence section heading dark",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".sequence-subtitle",
    theme: "light",
    getFg: (t) => t.muted,
    getBg: (t) => t.background,
    minRequired: 4.5,
    type: "normal-text",
    note: "Sequence section subtitle light",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".sequence-subtitle",
    theme: "dark",
    getFg: (t) => t.muted,
    getBg: (t) => t.background,
    minRequired: 4.5,
    type: "normal-text",
    note: "Sequence section subtitle dark",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".signal-role",
    theme: "light",
    getFg: (t) => t.text,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Signal chip role light",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".signal-role",
    theme: "dark",
    getFg: (t) => t.text,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Signal chip role dark",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".signal-mode",
    theme: "light",
    getFg: (t) => t.muted,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Signal chip mode light",
  },
  {
    category: "Landing Sequences & Signals",
    element: ".signal-mode",
    theme: "dark",
    getFg: (t) => t.muted,
    getBg: (t) => t.surface,
    minRequired: 4.5,
    type: "normal-text",
    note: "Signal chip mode dark",
  },

  // 7. Jobs Radar Mid-score Badge
  {
    category: "Jobs Radar Mid-score",
    element: '.job-score[data-tone="mid"] (gradient stop 1: 80% warning + 20% white)',
    theme: "light",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => mixSrgb(t.warning, 0.8, parseHex("#ffffff"), 0.2),
    minRequired: 3.0, // badge
    type: "badge",
    note: "Job score mid tone light stop 1",
  },
  {
    category: "Jobs Radar Mid-score",
    element: '.job-score[data-tone="mid"] (gradient stop 2: warning base)',
    theme: "light",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => t.warning,
    minRequired: 3.0, // badge
    type: "badge",
    note: "Job score mid tone light stop 2",
  },
  {
    category: "Jobs Radar Mid-score",
    element: '.job-score[data-tone="mid"] (gradient stop 1: 80% warning + 20% white)',
    theme: "dark",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => mixSrgb(t.warning, 0.8, parseHex("#ffffff"), 0.2),
    minRequired: 3.0, // badge
    type: "badge",
    note: "Job score mid tone dark stop 1",
  },
  {
    category: "Jobs Radar Mid-score",
    element: '.job-score[data-tone="mid"] (gradient stop 2: warning base)',
    theme: "dark",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => t.warning,
    minRequired: 3.0, // badge
    type: "badge",
    note: "Job score mid tone dark stop 2",
  },

  // 8. Saved Skills Badge (.badge-info)
  {
    category: "Saved Skills Badges",
    element: ".badge-info",
    theme: "light",
    getFg: (t) => t.primaryStrong,
    // background: color-mix(in srgb, var(--app-blue) 12%, var(--app-panel))
    getBg: (t) => mixSrgb(t.accent, 0.12, t.surface, 0.88),
    minRequired: 4.5,
    type: "normal-text",
    note: "Saved skills badge-info in light mode",
  },
  {
    category: "Saved Skills Badges",
    element: ".badge-info",
    theme: "dark",
    getFg: (t) => t.primaryStrong,
    getBg: (t) => mixSrgb(t.accent, 0.12, t.surface, 0.88),
    minRequired: 4.5,
    type: "normal-text",
    note: "Saved skills badge-info in dark mode",
  },

  // 9. Non-Text Graphics & Meter Tracks
  {
    category: "Non-Text Graphics",
    element: ".score-ring-track / .mini-ring-track / .trend-chart-guide",
    theme: "light",
    // stroke: color-mix(in srgb, var(--border) 60%, var(--text))
    getFg: (t) => mixSrgb(t.border, 0.6, t.text, 0.4),
    getBg: (t) => t.surface,
    minRequired: 3.0, // graphical object
    type: "graphics",
    note: "Chart/meter tracks on surface in light mode",
  },
  {
    category: "Non-Text Graphics",
    element: ".score-ring-track / .mini-ring-track / .trend-chart-guide",
    theme: "dark",
    getFg: (t) => mixSrgb(t.border, 0.6, t.text, 0.4),
    getBg: (t) => t.surface,
    minRequired: 3.0, // graphical object
    type: "graphics",
    note: "Chart/meter tracks on surface in dark mode",
  },

  // 10. Focus Indicators
  {
    category: "Focus Indicators",
    element: "input:focus-visible, button:focus-visible, .field:focus",
    theme: "light",
    getFg: (t) => t.focus,
    getBg: (t) => t.surface,
    minRequired: 3.0, // non-text UI control
    type: "focus-indicator",
    note: "Focus ring against surface in light mode",
  },
  {
    category: "Focus Indicators",
    element: "input:focus-visible, button:focus-visible, .field:focus",
    theme: "dark",
    getFg: (t) => t.focus,
    getBg: (t) => t.surface,
    minRequired: 3.0, // non-text UI control
    type: "focus-indicator",
    note: "Focus ring against surface in dark mode",
  },

  // 11. Jobs Radar Tag Gap (.job-tag-gap)
  {
    category: "Jobs Radar Tags",
    element: ".job-tag-gap",
    theme: "light",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => mixSrgb(t.warning, 0.10, t.surface, 0.90),
    minRequired: 4.5,
    type: "normal-text",
    note: "Job tag gap in light mode",
  },
  {
    category: "Jobs Radar Tags",
    element: ".job-tag-gap",
    theme: "dark",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => mixSrgb(t.warning, 0.10, t.surface, 0.90),
    minRequired: 4.5,
    type: "normal-text",
    note: "Job tag gap in dark mode (hardcoded --text-on-warning: #1c1917)",
  },
  {
    category: "Jobs Radar Tags",
    element: ".workspace .feature-page .job-tag-gap",
    theme: "dark",
    getFg: (t) => t.textOnWarning,
    getBg: (t) => mixSrgb(t.warning, 0.12, t.surface, 0.88),
    minRequired: 4.5,
    type: "normal-text",
    note: "Workspace job tag gap in dark mode",
  },
];


export function runVerification() {
  const results = [];

  for (const testCase of TEST_CASES) {
    const themeDict = THEMES[testCase.theme];
    const fg = testCase.getFg(themeDict);
    const bg = testCase.getBg(themeDict);

    const lFg = relativeLuminance(fg.r, fg.g, fg.b);
    const lBg = relativeLuminance(bg.r, bg.g, bg.b);
    const contrast = contrastRatio(lFg, lBg);

    const passes = contrast >= testCase.minRequired;

    results.push({
      category: testCase.category,
      element: testCase.element,
      theme: testCase.theme,
      type: testCase.type,
      fgColor: `rgb(${fg.r}, ${fg.g}, ${fg.b})`,
      bgColor: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
      lForeground: Number(lFg.toFixed(4)),
      lBackground: Number(lBg.toFixed(4)),
      contrastRatio: Number(contrast.toFixed(2)),
      minRequired: testCase.minRequired,
      passes,
      note: testCase.note,
    });
  }

  return results;
}

const results = runVerification();
console.log(JSON.stringify(results, null, 2));

const failures = results.filter((r) => !r.passes);
console.log(`\nTotal tests: ${results.length}`);
console.log(`Passed: ${results.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.error("\nFAILURES DETECTED:");
  for (const f of failures) {
    console.error(
      `[${f.theme.toUpperCase()}] ${f.element}: contrast ${f.contrastRatio}:1 (required >= ${f.minRequired}:1) - ${f.note}`
    );
  }
  process.exitCode = 1;
} else {
  console.log("\nALL TESTS PASSED!");
}

