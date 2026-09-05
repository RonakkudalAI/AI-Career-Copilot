/**
 * Canonical public origin for auth emails and OAuth continue URLs.
 * Loopback hosts must never be written into verification emails — those links
 * are opened on another device/network and 127.0.0.1 is unreachable there.
 */

export const CANONICAL_APP_ORIGIN = "https://career-copilot-neon.vercel.app";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function isLoopbackOrigin(origin: string | null | undefined): boolean {
  const raw = String(origin || "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function publicAppOrigin(options?: {
  envOrigin?: string | null;
  currentOrigin?: string | null;
}): string {
  const envOrigin = String(
    options?.envOrigin ??
      (typeof import.meta !== "undefined" ? import.meta.env.VITE_PUBLIC_APP_ORIGIN : "") ??
      "",
  )
    .trim()
    .replace(/\/$/, "");
  if (envOrigin && !isLoopbackOrigin(envOrigin)) return envOrigin;

  const current =
    options?.currentOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  if (current && !isLoopbackOrigin(current)) return current.replace(/\/$/, "");

  return CANONICAL_APP_ORIGIN;
}

export function authCallbackUrl(
  next = "/onboarding",
  options?: { envOrigin?: string | null; currentOrigin?: string | null },
): string {
  const dest = next.startsWith("/") ? next : `/${next}`;
  return `${publicAppOrigin(options)}/auth/callback?next=${encodeURIComponent(dest)}`;
}
