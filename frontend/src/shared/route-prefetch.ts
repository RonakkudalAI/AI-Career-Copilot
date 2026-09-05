import { resolveApiBase } from "@/shared/config";

/**
 * Prefetch lazy route modules on nav hover/focus so first click feels instant.
 * Loaders must match App.tsx dynamic imports.
 */
const routeLoaders: Array<{ match: (path: string) => boolean; load: () => Promise<unknown> }> = [
  {
    match: (p) => p === "/dashboard",
    load: () => import("@/features/dashboard/components/dashboard"),
  },
  {
    match: (p) => p === "/jobs" || p.startsWith("/jobs/"),
    load: () => import("@/features/jobs/components/jobs"),
  },
  {
    match: (p) => p === "/learning" || p.startsWith("/learning/"),
    load: () => import("@/features/learning/components/learning"),
  },
  {
    match: (p) => p === "/mock-interview/preparation" || p.startsWith("/mock-interview/preparation"),
    load: () => import("@/features/interview/components/interview-preparation"),
  },
  {
    match: (p) => p === "/mock-interview" || p.startsWith("/mock-interview/"),
    load: () => import("@/features/interview/components/interview-flow"),
  },
  {
    match: (p) => p === "/resume-analysis" || p.startsWith("/resume-analysis/"),
    load: () => import("@/features/resume/components/resume-flow"),
  },
  {
    match: (p) => p.startsWith("/settings/"),
    load: () => import("@/features/settings/components/settings"),
  },
  {
    match: (p) => p === "/onboarding",
    load: () => import("@/features/onboarding/components/onboarding"),
  },
  {
    match: (p) => p === "/teams",
    load: () => import("@/features/marketing/components/teams"),
  },
  {
    match: (p) =>
      p === "/sign-in" ||
      p === "/sign-up" ||
      p === "/forgot-password" ||
      p === "/reset-password" ||
      p === "/verify-email",
    load: () => import("@/features/auth/components/auth-screen"),
  },
];

const prefetched = new Set<string>();
let backendWarmed = false;

/**
 * Silently pre-warms free-tier backend (e.g. Render spin-up) on visitor entry.
 * Uses keepalive + non-blocking fetch to ensure zero impact on frontend UI thread.
 */
export function warmUpBackend(): void {
  if (backendWarmed || typeof window === "undefined") return;
  backendWarmed = true;
  try {
    const base = resolveApiBase();
    void fetch(`${base}/health/live`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Ignore warmup errors
  }
}

export function prefetchRoute(href: string): void {
  if (typeof window === "undefined" || !href) return;
  warmUpBackend();
  const path = href.split("?")[0].split("#")[0] || href;
  if (prefetched.has(path)) return;
  const entry = routeLoaders.find((item) => item.match(path));
  if (!entry) return;
  prefetched.add(path);
  void entry.load().catch(() => {
    // Allow retry on next hover if chunk failed (offline, etc.).
    prefetched.delete(path);
  });
}

const WORKSPACE_PREFETCH_HREFS = [
  "/dashboard",
  "/resume-analysis",
  "/mock-interview",
  "/mock-interview/preparation",
  "/learning",
  "/jobs",
  "/settings/profile",
];

/** Idle-load workspace chunks after first paint so later clicks skip the loading flash. */
export function prefetchWorkspace(): void {
  if (typeof window === "undefined") return;
  warmUpBackend();
  const run = () => {
    for (const href of WORKSPACE_PREFETCH_HREFS) prefetchRoute(href);
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") idle(run, { timeout: 1800 });
  else window.setTimeout(run, 180);
}
