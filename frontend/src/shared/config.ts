/**
 * Shared frontend configuration constants.
 * Prefer environment variables for deploy-specific values; keep protocol
 * path prefixes and cookie names here so they are not duplicated ad hoc.
 */

/** Browser-side BFF proxy prefix (Next.js route handlers). */
export const BROWSER_API_PROXY_PREFIX = "/api/backend";

/**
 * Upstream FastAPI versioned API prefix.
 * Mirrors backend `API_V1_PREFIX` when provided at build/runtime.
 */
export const API_V1_PREFIX =
  (typeof process !== "undefined" && process.env.API_V1_PREFIX?.trim()) || "/api/v1";

/** localStorage key for the access token (browser). */
export const ACCESS_TOKEN_STORAGE_KEY = "career_copilot_access_token";

/** Session cookie name shared with the backend auth dependency. */
export const SESSION_COOKIE_NAME = "career_copilot_session";

/** Demo-mode cookie name/value (client-only preview path). */
export const DEMO_COOKIE_NAME = "career_copilot_demo";
export const DEMO_COOKIE_VALUE = "1";
export const DEMO_COOKIE_PAIR = `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}`;

/**
 * Resolve the absolute or relative base used for API requests.
 * - Browser: always the same-origin BFF proxy (avoids CORS).
 * - Server: PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_BASE_URL + versioned prefix.
 */
export function resolveApiBase(): string {
  if (typeof window !== "undefined") return BROWSER_API_PROXY_PREFIX;
  const url = process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) throw new Error("API base URL is not configured.");
  return `${url.replace(/\/$/, "")}${API_V1_PREFIX}`;
}

/** Absolute upstream API origin (server-only; no versioned path). */
export function resolveUpstreamApiOrigin(): string {
  const url = process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) throw new Error("API base URL is not configured.");
  return url.replace(/\/$/, "");
}

export function isDemoCookiePresent(cookieSource?: string): boolean {
  if (typeof document === "undefined" && cookieSource === undefined) return false;
  const raw = cookieSource ?? document.cookie;
  return raw.split("; ").includes(DEMO_COOKIE_PAIR);
}
