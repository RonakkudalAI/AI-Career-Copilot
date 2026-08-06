export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  const candidate = (value || "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
