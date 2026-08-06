
import {
  ACCESS_TOKEN_STORAGE_KEY,
  resolveApiBase,
  SESSION_COOKIE_NAME,
  isDemoCookiePresent,
} from "@/shared/config";
import {
  completeGoogleRedirectSignIn,
  googleAuthErrorMessage,
  signInWithGoogle,
} from "@/features/auth/firebase";

type AuthError = { message: string } | null;
type AuthUser = { id: string; email: string; user_metadata?: { full_name?: string } };

function token() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "";
}

function saveToken(value: string) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, value);
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
}

async function request(path: string, body?: unknown) {
  const accessToken = token();
  const endpoint = `${resolveApiBase()}${path}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Authentication server is unavailable at ${endpoint}. Start the backend API and try again.`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.detail || `Authentication request failed (${response.status}).`;
    const code = payload?.error?.code ? ` [${payload.error.code}]` : "";
    throw new Error(`${message}${code}`);
  }
  if (path !== "/auth/resend" && path !== "/auth/reset-password" && path !== "/auth/sign-out" && !payload?.access_token && path !== "/auth/session") {
    throw new Error("Authentication server returned an incomplete session. Please try again.");
  }
  return payload;
}

export function createClient() {
  async function signInWithFirebaseIdToken(idToken: string) {
    try {
      const payload = await request("/auth/firebase", { id_token: idToken });
      saveToken(payload.access_token);
      return {
        data: { session: { access_token: payload.access_token }, user: payload.user },
        error: null as AuthError,
      };
    } catch (error) {
      return { data: { session: null, user: null }, error: { message: (error as Error).message } };
    }
  }

  return {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        try {
          const payload = await request("/auth/sign-in", { email, password });
          saveToken(payload.access_token);
          return {
            data: { session: { access_token: payload.access_token }, user: payload.user },
            error: null as AuthError,
          };
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: (error as Error).message } };
        }
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
      }) {
        try {
          const payload = await request("/auth/sign-up", {
            email,
            password,
            full_name: options?.data?.full_name,
          });
          saveToken(payload.access_token);
          return {
            data: { session: { access_token: payload.access_token }, user: payload.user },
            error: null as AuthError,
          };
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: (error as Error).message } };
        }
      },
      async resend({ email }: { type: string; email: string; options?: unknown }) {
        try {
          await request("/auth/resend", { email });
          return { error: null as AuthError };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      async signInWithOAuth({ provider }: { provider: string; options?: { redirectTo?: string } }) {
        if (provider !== "google") {
          return { error: { message: "Only Google sign-in is configured for local development." } };
        }
        try {
          const result = await signInWithGoogle();
          if (!result) return { data: { session: null, user: null }, error: null as AuthError };
          return signInWithFirebaseIdToken(result.idToken);
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: googleAuthErrorMessage(error) } };
        }
      },
      async completeGoogleRedirect() {
        try {
          const result = await completeGoogleRedirectSignIn();
          if (!result) return { data: { session: null, user: null }, error: null as AuthError };
          return signInWithFirebaseIdToken(result.idToken);
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: googleAuthErrorMessage(error) } };
        }
      },
      async signInWithFirebaseIdToken(idToken: string) {
        return signInWithFirebaseIdToken(idToken);
      },
      async getSession() {
        const value = token();
        return {
          data: { session: value ? { access_token: value } : null },
          error: null as AuthError,
        };
      },
      async getUser() {
        if (isDemoCookiePresent()) {
          return {
            data: { user: { id: "demo-user", email: "demo@example.com", user_metadata: { full_name: "Demo Candidate" } } as AuthUser },
            error: null as AuthError,
          };
        }
        try {
          const payload = await request("/auth/session");
          return { data: { user: payload.user as AuthUser }, error: null as AuthError };
        } catch (error) {
          return { data: { user: null }, error: { message: (error as Error).message } };
        }
      },
      async updateUser({
        password,
        current_password,
      }: {
        password: string;
        current_password?: string;
      }) {
        return request("/auth/update-password", {
          password,
          ...(current_password ? { current_password } : {}),
        })
          .then(() => ({ error: null as AuthError }))
          .catch((error) => ({ error: { message: (error as Error).message } }));
      },
      async resetPasswordForEmail(email: string, options?: unknown) {
        void options;
        return request("/auth/reset-password", { email })
          .then(() => ({ error: null as AuthError }))
          .catch((error) => ({ error: { message: (error as Error).message } }));
      },
      async signOut() {
        window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        document.cookie = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
        if (isDemoCookiePresent()) return { error: null as AuthError };
        await request("/auth/sign-out").catch(() => undefined);
        return { error: null as AuthError };
      },
    },
  };
}
