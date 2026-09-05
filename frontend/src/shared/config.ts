

export const BROWSER_API_PROXY_PREFIX = "/api/backend";

export const API_V1_PREFIX =
  import.meta.env.VITE_API_V1_PREFIX?.trim() || "/api/v1";

export const ACCESS_TOKEN_STORAGE_KEY = "career_copilot_access_token";

export const DEMO_COOKIE_NAME = "career_copilot_demo";
export const DEMO_COOKIE_VALUE = "1";
export const DEMO_COOKIE_PAIR = `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}`;

/**
 * Browser API base for fetch().
 * - Prefer VITE_API_BASE_URL (absolute origin) for static production hosting without a proxy.
 * - Fall back to same-origin /api/backend for Vite dev + vite preview proxy.
 * Production static hosts (nginx, CDN) must either set VITE_API_BASE_URL at build time
 * or reverse-proxy /api/backend and /api/files to the FastAPI service.
 */
export function resolveApiBase(): string {
  const url = import.meta.env.VITE_API_BASE_URL?.trim();
  if (url) return `${url.replace(/\/$/, "")}${API_V1_PREFIX}`;
  if (import.meta.env.PROD && typeof window !== "undefined") {
    // Same-origin proxy path is intentional for vite preview / reverse-proxied deploys.
    // Direct static file hosts without a reverse proxy will fail fetch with a clear network error.
  }
  return BROWSER_API_PROXY_PREFIX;
}

export function resolveUpstreamApiOrigin(): string {
  const url = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!url) throw new Error("API base URL is not configured.");
  return url.replace(/\/$/, "");
}

export function isDemoCookiePresent(cookieSource?: string): boolean {
  // Production builds never treat demo cookie as active (fail closed).
  if (import.meta.env.PROD) return false;
  if (typeof document === "undefined" && cookieSource === undefined) return false;
  const raw = cookieSource ?? document.cookie;
  return raw.split("; ").includes(DEMO_COOKIE_PAIR);
}
