

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
export const DEFAULT_PRODUCTION_BACKEND_URL = "https://career-copilot-backend-4ruf.onrender.com";

export function resolveApiBase(): string {
  const url = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    DEFAULT_PRODUCTION_BACKEND_URL
  )?.trim() || "";
  const cleaned = url.replace(/\/$/, "");
  if (!cleaned) return BROWSER_API_PROXY_PREFIX;
  if (cleaned.endsWith(API_V1_PREFIX)) return cleaned;
  return `${cleaned}${API_V1_PREFIX}`;
}

export function resolveUpstreamApiOrigin(): string {
  const url = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    DEFAULT_PRODUCTION_BACKEND_URL
  )?.trim() || "";
  let cleaned = url.replace(/\/$/, "");
  if (cleaned.endsWith(API_V1_PREFIX)) {
    cleaned = cleaned.slice(0, -API_V1_PREFIX.length).replace(/\/$/, "");
  }
  return cleaned;
}

export function isDemoCookiePresent(cookieSource?: string): boolean {
  // Production builds never treat demo cookie as active (fail closed).
  if (import.meta.env.PROD) return false;
  if (typeof document === "undefined" && cookieSource === undefined) return false;
  const raw = cookieSource ?? document.cookie;
  return raw.split("; ").includes(DEMO_COOKIE_PAIR);
}
