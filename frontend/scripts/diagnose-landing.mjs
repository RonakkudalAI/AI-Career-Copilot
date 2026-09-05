import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl =
  process.argv[2] || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test-results",
  "landing-diagnose",
);
mkdirSync(outDir, { recursive: true });

const findings = [];
function note(level, name, detail) {
  findings.push({ level, name, detail });
  const tag =
    level === "error" ? "ERROR" : level === "warn" ? "WARN " : "INFO ";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function collectPageSignals(page, label) {
  const signals = await page.evaluate(() => {
    const parseRgb = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((p) => Number.parseFloat(p.trim()));
      return parts.length >= 3 ? parts.slice(0, 3) : null;
    };
    const luminance = (rgb) => {
      const channels = rgb
        .map((c) => c / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (fg, bg) => {
      const a = luminance(fg);
      const b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const backgroundFor = (el) => {
      let current = el;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        const rgb = parseRgb(value);
        if (rgb && value !== "rgba(0, 0, 0, 0)") return { rgb, value };
        current = current.parentElement;
      }
      return { rgb: [247, 247, 245], value: "fallback" };
    };

    const selectors = [
      ".home-page",
      ".nav5-wrapper",
      ".home-hero",
      ".home-hero-copy",
      ".home-hero-visual",
      ".home-window",
      ".home-camera-video",
      ".home-float-card",
      ".home-practice",
      ".home-practice-card",
      ".home-system",
      ".home-feature",
      ".home-profile",
      ".home-profile-sheet",
      ".home-final-card",
      ".home-footer",
      ".home-beams",
      ".home-beams canvas",
    ];

    const boxes = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          selector: index ? `${selector}[${index}]` : selector,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          overflowX: Math.round(
            rect.right - document.documentElement.clientWidth,
          ),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          position: style.position,
          overflow: style.overflow,
          animationName: style.animationName,
          animationPlayState: style.animationPlayState,
          animationDuration: style.animationDuration,
          transform: style.transform,
          pointerEvents: style.pointerEvents,
          clip: style.clip,
          clipPath: style.clipPath,
        };
      }),
    );

    const contrastChecks = [
      ".home-hero-lede",
      ".home-hero h1",
      ".home-kicker",
      ".home-practice-copy > p:not(.home-kicker)",
      ".home-practice-copy h2",
      ".home-system-copy h2",
      ".home-feature h3",
      ".home-feature > p:last-child",
      ".home-profile .home-sheet-main p",
      ".home-footer",
      ".nav5-pill a",
    ].map((selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, missing: true, ratio: 0 };
      const fg = parseRgb(getComputedStyle(el).color);
      const bg = backgroundFor(el);
      return {
        selector,
        missing: false,
        color: getComputedStyle(el).color,
        background: bg.value,
        ratio: fg ? Number(contrast(fg, bg.rgb).toFixed(2)) : 0,
      };
    });

    const video = document.querySelector(".home-camera-video");
    const videoState = video
      ? {
          src: video.getAttribute("src"),
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused,
          muted: video.muted,
          error: video.error ? video.error.code : null,
          videoWidth: video.videoWidth,
          currentTime: video.currentTime,
        }
      : null;

    const beams = document.querySelector(".home-beams canvas");
    let beamPixels = 0;
    if (beams) {
      const ctx = beams.getContext("2d");
      if (ctx) {
        const w = Math.min(beams.width, 800);
        const h = Math.min(beams.height, 500);
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < data.length; i += 4)
          if (data[i] > 8) beamPixels += 1;
      }
    }

    const featurePad = Array.from(
      document.querySelectorAll(".home-feature"),
    ).map((el, i) => ({
      i,
      paddingTop: getComputedStyle(el).paddingTop,
      padding: getComputedStyle(el).padding,
    }));

    const reveal = Array.from(document.querySelectorAll(".home-reveal")).map(
      (el) => ({
        className: el.className,
        revealed: el.classList.contains("home-revealed"),
        top: Math.round(el.getBoundingClientRect().top),
        opacity: getComputedStyle(el).opacity,
      }),
    );

    const images = Array.from(document.images).map((img) => ({
      src: img.currentSrc || img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }));

    return {
      theme: document.documentElement.getAttribute("data-theme"),
      motion: document.querySelector(".home-page")?.getAttribute("data-motion"),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      boxes,
      contrastChecks,
      videoState,
      beamPixels,
      beamCanvas: beams ? { width: beams.width, height: beams.height } : null,
      featurePad,
      reveal,
      images,
      h1: document
        .querySelector("h1")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  return { label, ...signals };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("requestfailed", (req) =>
    failed.push(`${req.method()} ${req.url()} ${req.failure()?.errorText}`),
  );

  const response = await page.goto(baseUrl, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  note(
    response?.ok() ? "info" : "error",
    "page-load",
    `status=${response?.status()}`,
  );
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(outDir, "desktop-hero.png"),
    fullPage: false,
  });

  const hero = await collectPageSignals(page, "hero");
  await page.screenshot({
    path: join(outDir, "desktop-full.png"),
    fullPage: true,
  });

  if (consoleErrors.length)
    note("error", "console-errors", consoleErrors.slice(0, 8).join(" | "));
  else note("info", "console-errors", "none");
  if (pageErrors.length)
    note("error", "page-errors", pageErrors.slice(0, 8).join(" | "));
  else note("info", "page-errors", "none");
  const criticalFails = failed.filter(
    (r) => !/favicon|fonts\.googleapis|gstatic|hot-update/i.test(r),
  );
  if (criticalFails.length)
    note("error", "network-failed", criticalFails.slice(0, 8).join(" | "));
  else note("info", "network-failed", "none");

  if (!hero.h1 || !/Show up/i.test(hero.h1))
    note("error", "missing-h1", JSON.stringify(hero.h1));
  if (hero.overflowX > 8)
    note("error", "overflow-x-hero", `${hero.overflowX}px`);
  if (hero.motion !== "running")
    note("error", "motion-not-running", String(hero.motion));

  const windowBox = hero.boxes.find((b) => b.selector === ".home-window");
  if (!windowBox || windowBox.width < 200)
    note("error", "hero-window-missing", JSON.stringify(windowBox));
  if (
    windowBox &&
    (!windowBox.animationName || windowBox.animationName === "none")
  ) {
    note("error", "hero-window-static", JSON.stringify(windowBox));
  } else {
    note("info", "hero-window-animation", windowBox?.animationName);
  }

  const videoBox = hero.boxes.find((b) => b.selector === ".home-camera-video");
  if (!videoBox || videoBox.height < 40)
    note("error", "video-box", JSON.stringify(videoBox));
  if (hero.videoState?.error)
    note("error", "video-error", JSON.stringify(hero.videoState));
  else if (hero.videoState && hero.videoState.videoWidth === 0)
    note("error", "video-not-decoded", JSON.stringify(hero.videoState));
  else if (hero.videoState?.paused)
    note("warn", "video-paused", JSON.stringify(hero.videoState));
  else note("info", "video", JSON.stringify(hero.videoState));

  if (hero.beamPixels < 20)
    note(
      "warn",
      "beams-faint",
      `pixels=${hero.beamPixels} canvas=${JSON.stringify(hero.beamCanvas)}`,
    );
  else note("info", "beams", `pixels=${hero.beamPixels}`);

  for (const check of hero.contrastChecks) {
    if (check.missing) note("error", "contrast-missing", check.selector);
    else if (check.ratio < 4.5)
      note(
        "error",
        "contrast-fail",
        `${check.selector} ratio=${check.ratio} color=${check.color} bg=${check.background}`,
      );
  }

  const zero = hero.boxes.filter((b) => b.width === 0 || b.height === 0);
  if (zero.length)
    note(
      "warn",
      "zero-size",
      zero.map((b) => `${b.selector} ${b.width}x${b.height}`).join("; "),
    );

  for (const pad of hero.featurePad) {
    if (pad.paddingTop === "0px" && pad.i > 0)
      note("warn", "feature-padding-zero", JSON.stringify(pad));
  }

  const navTopBefore = await page.evaluate(
    () =>
      document.querySelector(".nav5-wrapper")?.getBoundingClientRect().top ??
      null,
  );
  await page.evaluate(() =>
    window.scrollTo({ top: 1400, behavior: "instant" }),
  );
  await page.waitForTimeout(500);
  const navTopAfter = await page.evaluate(
    () =>
      document.querySelector(".nav5-wrapper")?.getBoundingClientRect().top ??
      null,
  );
  await page.screenshot({ path: join(outDir, "desktop-practice.png") });
  if (navTopAfter !== null && Math.abs(navTopAfter) > 40) {
    note(
      "error",
      "sticky-nav-broke",
      `before=${navTopBefore} after=${navTopAfter}`,
    );
  } else {
    note("info", "sticky-nav", `before=${navTopBefore} after=${navTopAfter}`);
  }

  const mid = await collectPageSignals(page, "scrolled");
  const unrevealedVisible = mid.reveal.filter(
    (r) => !r.revealed && r.top < 700,
  );
  if (unrevealedVisible.length)
    note("error", "reveal-stuck", JSON.stringify(unrevealedVisible));
  else
    note(
      "info",
      "reveal",
      JSON.stringify(
        mid.reveal.map((r) => ({
          revealed: r.revealed,
          top: r.top,
          opacity: r.opacity,
        })),
      ),
    );

  await page.evaluate(() =>
    document
      .querySelector("#system")
      ?.scrollIntoView({ behavior: "instant", block: "start" }),
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, "desktop-system.png") });
  const system = await collectPageSignals(page, "system");
  const featureBoxes = system.boxes.filter((b) =>
    b.selector.startsWith(".home-feature"),
  );
  if (featureBoxes.length !== 3)
    note("error", "feature-count", String(featureBoxes.length));
  const stillHidden = system.reveal.filter((r) => !r.revealed && r.top < 800);
  if (stillHidden.length)
    note("error", "system-reveal-stuck", JSON.stringify(stillHidden));

  await page.evaluate(() =>
    document
      .querySelector(".home-final")
      ?.scrollIntoView({ behavior: "instant", block: "start" }),
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, "desktop-final.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, "mobile-hero.png") });
  const mobile = await collectPageSignals(page, "mobile");
  if (mobile.overflowX > 8)
    note("error", "overflow-x-mobile", `${mobile.overflowX}px`);
  const menu = page.getByRole("button", { name: /Open navigation/i });
  if (!(await menu.isVisible())) note("error", "mobile-menu-missing");
  else {
    await menu.click();
    const dialog = page.getByRole("dialog");
    if (!(await dialog.isVisible())) note("error", "mobile-dialog-missing");
    else {
      await page.screenshot({ path: join(outDir, "mobile-menu.png") });
      await page.keyboard.press("Escape");
    }
  }

  await page.addInitScript(() =>
    localStorage.setItem("career-copilot-theme", "dark"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, "desktop-dark.png") });
  const dark = await collectPageSignals(page, "dark");
  for (const check of dark.contrastChecks) {
    if (!check.missing && check.ratio < 4.5)
      note(
        "error",
        "dark-contrast-fail",
        `${check.selector} ratio=${check.ratio}`,
      );
  }

  const brokenImages = [...hero.images, ...dark.images].filter(
    (img) => img.complete && img.naturalWidth === 0,
  );
  if (brokenImages.length)
    note("error", "broken-images", brokenImages.map((i) => i.src).join(" | "));

  console.log("\n=== DIAGNOSE SUMMARY ===");
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  console.log(`errors=${errors.length} warns=${warns.length} out=${outDir}`);
  for (const f of errors) console.log(`  ERROR ${f.name}: ${f.detail}`);
  for (const f of warns) console.log(`  WARN  ${f.name}: ${f.detail}`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
