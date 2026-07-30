import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type ApiErrorBody = { error?: { code?: string; message?: string; request_id?: string } };

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createSupabaseClient();
if (!supabase) throw new Error("Supabase is not configured. Add the public values to the root .env file.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Your session has expired. Sign in again.");
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new Error(body.error?.message || `Request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
