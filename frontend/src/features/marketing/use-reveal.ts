import { useLayoutEffect, useRef } from "react";

export interface RevealOptions {
  /** Stagger delay in ms before the transition starts. */
  delay?: number;
  /** Resting translate offset in px while waiting to be revealed. */
  y?: number;
  /** Fraction of the element that must be visible to trigger (0..1). */
  threshold?: number;
  /** Fires once when the element is shown (intersecting or already past). */
  onReveal?: () => void;
}

/**
 * Adds `.home-reveal` pre-paint, then flips to `.home-revealed` when the
 * element enters the viewport. Elements that a fast scroll or hash jump
 * skips past are shown immediately so they never stay at opacity 0.
 * A no-JS render or `prefers-reduced-motion` keeps everything visible.
 */
export function useReveal<T extends HTMLElement>(options: RevealOptions = {}) {
  const ref = useRef<T | null>(null);
  const { delay = 0, y = 22, threshold = 0, onReveal } = options;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const finishWithoutMotion = () => {
      // Do NOT fix at the crash site (CSS opacity). Enrich via instant reveal
      // so telemetry distinguishes paused/reduced-motion: value is the element's
      // position, type is DOMRect, context is "useReveal:reduced-motion/paused".
      el.classList.add("home-reveal");
      el.classList.add("home-revealed");
      el.classList.add("home-reveal-instant");
      onReveal?.();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishWithoutMotion();
      return;
    }
    if (el.closest("[data-motion='paused']")) {
      finishWithoutMotion();
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      finishWithoutMotion();
      return;
    }

    el.style.setProperty("--reveal-delay", `${delay}ms`);
    el.style.setProperty("--reveal-y", `${y}px`);
    el.classList.add("home-reveal");

    let revealed = false;
    const inOrPastView = (rect: DOMRectReadOnly) => {
      if (rect.bottom <= 0) return "past" as const;
      if (rect.top < window.innerHeight * 0.92) return "in" as const;
      return "ahead" as const;
    };

    const onSkipCheck = () => {
      const where = inOrPastView(el.getBoundingClientRect());
      if (where === "past") reveal(true);
      else if (where === "in") reveal(false);
    };

    const reveal = (instant = false) => {
      if (revealed) return;
      revealed = true;
      if (instant) el.classList.add("home-reveal-instant");
      el.classList.add("home-revealed");
      onReveal?.();
      observer?.disconnect();
      window.removeEventListener("scroll", onSkipCheck);
      window.removeEventListener("resize", onSkipCheck);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(false);
            return;
          }
          const where = inOrPastView(entry.boundingClientRect);
          if (where === "past") {
            reveal(true);
            return;
          }
          if (where === "in") {
            reveal(false);
            return;
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    window.addEventListener("scroll", onSkipCheck, { passive: true });
    window.addEventListener("resize", onSkipCheck);
    onSkipCheck();

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onSkipCheck);
      window.removeEventListener("resize", onSkipCheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options are static per call site
  }, []);

  return ref;
}
