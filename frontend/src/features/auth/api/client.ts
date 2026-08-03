"use client";

type AuthError = { message: string } | null;
type AuthUser = { id: string; email: string; user_metadata?: { full_name?: string } };

const base = () => {
  if (typeof window !== "undefined") return "/api/backend";
  const url = process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) throw new Error("API base URL is not configured.");
  return `${url}/api/v1`;
};
const tokenKey = "career_copilot_access_token";

function token() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(tokenKey) || "";
}
function saveToken(value: string) {
  window.localStorage.setItem(tokenKey, value);
  document.cookie = `career_copilot_session=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
}
async function request(path: string, body?: unknown) {
  const accessToken = token();
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Authentication request failed.");
  return payload;
}

export function createClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        try {
          const payload = await request("/auth/sign-in", { email, password });
          saveToken(payload.access_token);
          return { data: { session: { access_token: payload.access_token }, user: payload.user }, error: null as AuthError };
        } catch (error) { return { data: { session: null, user: null }, error: { message: (error as Error).message } }; }
      },
      async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }) {
        try {
          const payload = await request("/auth/sign-up", { email, password, full_name: options?.data?.full_name });
          saveToken(payload.access_token);
          return { data: { session: { access_token: payload.access_token }, user: payload.user }, error: null as AuthError };
        } catch (error) { return { data: { session: null, user: null }, error: { message: (error as Error).message } }; }
      },
      async resend({ email }: { type: string; email: string; options?: unknown }) {
        try { await request("/auth/resend", { email }); return { error: null as AuthError }; }
        catch (error) { return { error: { message: (error as Error).message } }; }
      },
      async signInWithOAuth(...args: unknown[]) { void args; return { error: { message: "Social sign-in is not configured for local development." } }; },
      async getSession() { const value = token(); return { data: { session: value ? { access_token: value } : null }, error: null as AuthError }; },
      async getUser() {
        try { const payload = await request("/auth/session"); return { data: { user: payload.user as AuthUser }, error: null as AuthError }; }
        catch (error) { return { data: { user: null }, error: { message: (error as Error).message } }; }
      },
      async updateUser({ password }: { password: string }) { return request("/auth/update-password", { password }).then(() => ({ error: null as AuthError })).catch((error) => ({ error: { message: (error as Error).message } })); },
      async resetPasswordForEmail(email: string, options?: unknown) { void options; return request("/auth/reset-password", { email }).then(() => ({ error: null as AuthError })).catch((error) => ({ error: { message: (error as Error).message } })); },
      async signOut() { window.localStorage.removeItem(tokenKey); document.cookie = "career_copilot_session=; Max-Age=0; Path=/; SameSite=Lax"; await request("/auth/sign-out").catch(() => undefined); return { error: null as AuthError }; },
    },
  };
}
