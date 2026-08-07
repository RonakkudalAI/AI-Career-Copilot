import { createClient as createAuthClient } from "@/features/auth/api/client";
import { demoApiRequest, isDemoSession } from "@/features/auth/demo-session";
import { resolveApiBase } from "@/shared/config";

export type ApiErrorBody = { error?: { code?: string; message?: string; request_id?: string } };
const inFlightGets = new Map<string, Promise<unknown>>();

/** True when fetch was cancelled via AbortController (not a connectivity failure). */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  if (name === "AbortError") return true;
  // Some runtimes surface aborted fetches as DOMException without a stable subclass.
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return false;
}

function networkUnreachableMessage(base: string): string {
  const hint = base.startsWith("http") ? ` base=${base.slice(0, 80)}` : ` proxy=${base}`;
  return `Could not reach the API.${hint}. Start the backend (npm run dev) and confirm the Vite proxy (/api/backend → backend) or VITE_API_BASE_URL.`;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isDemoSession()) return demoApiRequest<T>(path, init);
  const authClient = createAuthClient();
  const {
    data: { session },
  } = await authClient.auth.getSession();
  if (!session) throw new Error("Your session has expired. Sign in again.");
  const method = (init.method || "GET").toUpperCase();
  const hasAbortSignal = Boolean(init.signal);
  // Never share in-flight GETs that carry AbortSignal: React Strict Mode (and
  // route unmount) aborts the first caller's signal, and a second caller that
  // reuses that promise would get AbortError rewritten as "API unreachable".
  const requestKey = `${method}:${path}:${session.access_token}`;
  if (method === "GET" && !hasAbortSignal) {
    const existing = inFlightGets.get(requestKey);
    if (existing) return existing as Promise<T>;
  }
  const base = resolveApiBase();
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
    } catch (error) {
      if (isAbortError(error) || init.signal?.aborted) {
        // Preserve abort semantics so callers can ignore cancelled work.
        throw error instanceof Error ? error : new DOMException("Aborted", "AbortError");
      }
      throw new Error(networkUnreachableMessage(base), { cause: error });
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      if (response.status === 401) {
        window.localStorage.removeItem("career_copilot_access_token");
        document.cookie = "career_copilot_session=; Path=/; Max-Age=0; SameSite=Lax";
        window.dispatchEvent(new CustomEvent("career-copilot:auth-expired"));
        throw new Error(body.error?.message || "Your session has expired. Sign in again.");
      }
      if (response.status === 503) {
        throw new Error(
          body.error?.message || "The service is temporarily unavailable. Please try again in a moment."
        );
      }
      throw new Error(body.error?.message || `Request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  })();
  if (method === "GET" && !hasAbortSignal) {
    inFlightGets.set(requestKey, request);
    request.finally(() => inFlightGets.delete(requestKey)).catch(() => undefined);
  }
  return request;
}
