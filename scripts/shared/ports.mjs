/**
 * Resolve local dev ports from environment without inventing a second config system.
 * Defaults match .env.example (API :8000, website :3000).
 */

export function portFromUrl(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.port) return parsed.port;
    if (parsed.protocol === "https:") return "443";
    if (parsed.protocol === "http:") return "80";
  } catch {
    /* ignore invalid URL */
  }
  return fallback;
}

export function backendPort(env = process.env) {
  if (env.BACKEND_PORT && String(env.BACKEND_PORT).trim()) {
    return String(env.BACKEND_PORT).trim();
  }
  return portFromUrl(env.PUBLIC_API_BASE_URL || env.NEXT_PUBLIC_API_BASE_URL, "8000");
}

export function frontendPort(env = process.env) {
  if (env.FRONTEND_PORT && String(env.FRONTEND_PORT).trim()) {
    return String(env.FRONTEND_PORT).trim();
  }
  if (env.PORT && String(env.PORT).trim()) {
    return String(env.PORT).trim();
  }
  const origins = String(env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins[0]) {
    return portFromUrl(origins[0], "3000");
  }
  return "3000";
}
