import { createClient as createAuthClient } from "@/features/auth/api/client";
import { demoApiRequest, isDemoSession } from "@/features/auth/demo-session";

export type ApiErrorBody = { error?: { code?: string; message?: string; request_id?: string } };

// Share only simultaneous GET requests. Nothing is persisted in sessionStorage,
// localStorage, or a client-side data cache.
const inFlightGets = new Map<string, Promise<unknown>>();

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isDemoSession()) return demoApiRequest<T>(path, init);
  const authClient = createAuthClient();
  const { data: { session } } = await authClient.auth.getSession();
  if (!session) throw new Error("Your session has expired. Sign in again.");
  const method = (init.method || "GET").toUpperCase();
  const requestKey = `${method}:${path}:${session.access_token}`;
  if (method === "GET") {
    const existing = inFlightGets.get(requestKey);
    if (existing) return existing as Promise<T>;
  }
  const base =
    typeof window === "undefined"
      ? `${process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/v1`
      : "/api/backend";
  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...init.headers,
        },
      });
    } catch {
      throw new Error(
        "Could not reach the API. Start the backend (npm run dev) and confirm NEXT_PUBLIC_API_BASE_URL.",
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      if (response.status === 503) {
        throw new Error(
          body.error?.message ||
            "The service is temporarily unavailable. Please try again in a moment.",
        );
      }
      throw new Error(body.error?.message || `Request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  })();
  if (method === "GET") {
    inFlightGets.set(requestKey, request);
    request.finally(() => inFlightGets.delete(requestKey)).catch(() => undefined);
  }
  return request;
}
