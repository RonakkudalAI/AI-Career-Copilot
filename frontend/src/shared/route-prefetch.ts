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

export function prefetchRoute(href: string): void {
  if (typeof window === "undefined" || !href) return;
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
