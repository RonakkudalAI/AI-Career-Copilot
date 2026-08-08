
import {
  ACCESS_TOKEN_STORAGE_KEY,
  resolveApiBase,
  SESSION_COOKIE_NAME,
  isDemoCookiePresent,
} from "@/shared/config";
import {
  completeGoogleRedirectSignIn,
  emailPasswordAuthErrorMessage,
  googleAuthErrorMessage,
  signInWithEmailPassword,
  signOutFromFirebase,
  signInWithGoogle,
} from "@/features/auth/firebase";
import { supabaseAuthClient, SupabaseWebConfigError } from "@/features/auth/supabase";

type AuthError = { message: string } | null;
type AuthUser = { id: string; email: string; user_metadata?: { full_name?: string } };

function token() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "";
}

function saveToken(value: string) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, value);
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  // Real sign-in must never stay trapped in demo mode (empty in-memory API).
  document.cookie = `career_copilot_demo=; Max-Age=0; Path=/; SameSite=Lax`;
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

  async function signInWithSupabaseAccessToken(accessToken: string) {
    try {
      const payload = await request("/auth/supabase", { access_token: accessToken });
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
          const result = await supabaseAuthClient().auth.signInWithPassword({ email: email.trim(), password });
          if (!result.error && result.data.session?.access_token) {
            return signInWithSupabaseAccessToken(result.data.session.access_token);
          }
          if (result.error) {
            // Preserve existing Firebase and legacy app-password accounts during migration.
            try {
              const firebaseResult = await signInWithEmailPassword(email, password);
              return signInWithFirebaseIdToken(firebaseResult.idToken);
            } catch {
              try {
                const payload = await request("/auth/sign-in", { email, password });
                saveToken(payload.access_token);
                return {
                  data: { session: { access_token: payload.access_token }, user: payload.user },
                  error: null as AuthError,
                };
              } catch {
                return { data: { session: null, user: null }, error: { message: result.error.message } };
              }
            }
          }
          return { data: { session: null, user: null }, error: { message: "Supabase did not return an authentication session." } };
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: error instanceof SupabaseWebConfigError ? error.message : emailPasswordAuthErrorMessage(error) } };
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
          const result = await supabaseAuthClient().auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { full_name: String(options?.data?.full_name || "") },
              emailRedirectTo: options?.emailRedirectTo,
            },
          });
          if (result.error) return { data: { session: null, user: null }, error: { message: result.error.message } };
          return { data: { session: null, user: null }, error: null as AuthError };
        } catch (error) {
          return { data: { session: null, user: null }, error: { message: error instanceof SupabaseWebConfigError ? error.message : emailPasswordAuthErrorMessage(error) } };
        }
      },
      async resend({ email }: { type: string; email: string; options?: unknown }) {
        try {
          const result = await supabaseAuthClient().auth.resend({ type: "signup", email });
          return result.error ? { error: { message: result.error.message } } : { error: null as AuthError };
        } catch (error) {
          return { error: { message: error instanceof SupabaseWebConfigError ? error.message : (error as Error).message } };
        }
      },
      async signInWithOAuth({ provider, options }: { provider: string; options?: { redirectTo?: string } }) {
        if (provider !== "google") {
          return { error: { message: "Only Google sign-in is configured for local development." } };
        }
        try {
          // Firebase returns to the URL that initiated the redirect. Move the
          // SPA to the callback route before starting it so the redirect path
          // can exchange the returned Firebase identity for the app JWT.
          if (options?.redirectTo) {
            const target = new URL(options.redirectTo, window.location.origin);
            window.history.replaceState({}, "", `${target.pathname}${target.search}`);
          }
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
          .then((payload) => {
            if (payload?.access_token) saveToken(String(payload.access_token));
            return { error: null as AuthError };
          })
          .catch((error) => ({ error: { message: (error as Error).message } }));
      },
      async resetPasswordForEmail(email: string, options?: unknown) {
        void options;
        return request("/auth/reset-password", { email })
          .then(() => ({ error: null as AuthError }))
          .catch((error) => ({ error: { message: (error as Error).message } }));
      },
      async completeAuthRedirect() {
        try {
          const { data } = await supabaseAuthClient().auth.getSession();
          if (data.session?.access_token) return signInWithSupabaseAccessToken(data.session.access_token);
        } catch {
          // If there is no Supabase session, complete the Firebase Google flow.
        }
        return this.completeGoogleRedirect();
      },
      async signOut() {
        window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        document.cookie = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
        await signOutFromFirebase().catch(() => undefined);
        try {
          await supabaseAuthClient().auth.signOut();
        } catch {
          // Supabase configuration is optional for Firebase Google sign-out.
        }
        if (isDemoCookiePresent()) return { error: null as AuthError };
        await request("/auth/sign-out").catch(() => undefined);
        return { error: null as AuthError };
      },
    },
  };
}
