
import {
  ACCESS_TOKEN_STORAGE_KEY,
  resolveApiBase,
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
import { APP_AUTH_TIMEOUT_MS, isTimeoutError, withTimeout } from "@/features/auth/api/timeout";

type AuthError = { message: string; status?: number } | null;
type AuthUser = {
  id: string;
  email: string;
  auth_provider?: "email" | "google" | "unknown";
  user_metadata?: { full_name?: string };
};

function token() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "";
}

function saveToken(value: string) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, value);
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
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    throw new Error(
      `Authentication server is unavailable at ${endpoint}. If this is the deployed site, set Render FRONTEND_ORIGINS to ${origin || "your Vercel origin"} and redeploy the API.`,
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.detail || `Authentication request failed (${response.status}).`;
    const code = payload?.error?.code ? ` [${payload.error.code}]` : "";
    // Enrich with the HTTP status so callers can distinguish definitive
    // rejections (401/403) from transient server failures (5xx).
    const error = new Error(`${message}${code}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
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
      return {
        data: { session: null, user: null },
        error: { message: (error as Error).message, status: (error as { status?: number }).status },
      };
    }
  }

  return {
    auth: {
      async signInWithPassword({ identifier, email, password }: { identifier?: string; email?: string; password: string }) {
        const trimmed = (identifier ?? email ?? "").trim();
        const isEmail = trimmed.includes("@");
        let lastMessage = "The email or password is incorrect.";
        // The application endpoint is the canonical identifier login path.
        // Provider auth remains a fallback for migrated accounts, but must not
        // delay a successful email/phone/username login.
        try {
          const payload = await withTimeout(
            request("/auth/sign-in", { identifier: trimmed, password }),
            "App sign-in",
            APP_AUTH_TIMEOUT_MS,
          );
          saveToken(payload.access_token);
          return {
            data: { session: { access_token: payload.access_token }, user: payload.user },
            error: null as AuthError,
          };
        } catch (error) {
          if (!isTimeoutError(error) && error instanceof Error && error.message) lastMessage = error.message;
        }

        if (isEmail) {
          let shouldTryFirebaseMigration = false;
          try {
            const result = await withTimeout(
              supabaseAuthClient().auth.signInWithPassword({ email: trimmed, password }),
              "Supabase sign-in",
              APP_AUTH_TIMEOUT_MS,
            );
            if (!result.error && result.data.session?.access_token) {
              return await withTimeout(
                signInWithSupabaseAccessToken(result.data.session.access_token),
                "Supabase session exchange",
                APP_AUTH_TIMEOUT_MS,
              );
            }
            if (result.error?.message) lastMessage = result.error.message;
          } catch (error) {
            shouldTryFirebaseMigration = error instanceof SupabaseWebConfigError || isTimeoutError(error);
            if (!(error instanceof SupabaseWebConfigError) && !isTimeoutError(error)) {
              lastMessage = emailPasswordAuthErrorMessage(error);
            }
          }

          if (shouldTryFirebaseMigration) {
            try {
              const firebaseResult = await withTimeout(signInWithEmailPassword(trimmed, password), "Firebase sign-in", APP_AUTH_TIMEOUT_MS);
              return await withTimeout(signInWithFirebaseIdToken(firebaseResult.idToken), "Firebase session exchange", APP_AUTH_TIMEOUT_MS);
            } catch {
              // Migration fallback is bounded; the app-password path below
              // remains the final source of truth for identifier sign-in.
            }
          }
        }

        try {
          const payload = await withTimeout(
            request("/auth/sign-in", { identifier: trimmed, password }),
            "App sign-in",
            APP_AUTH_TIMEOUT_MS,
          );
          saveToken(payload.access_token);
          return {
            data: { session: { access_token: payload.access_token }, user: payload.user },
            error: null as AuthError,
          };
        } catch (error) {
          if (isTimeoutError(error)) {
            return {
              data: { session: null, user: null },
              error: { message: "Authentication server is taking too long. Please check your connection and try again." },
            };
          }
          return {
            data: { session: null, user: null },
            error: { message: error instanceof Error && error.message ? error.message : lastMessage },
          };
        }
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown>; emailRedirectTo?: string; phone?: string };
      }) {
        const trimmed = email.trim();
        const phone = String(options?.phone || "").trim();
        try {
          const result = await withTimeout(
            supabaseAuthClient().auth.signUp({
              email: trimmed,
              password,
              options: {
                data: { full_name: String(options?.data?.full_name || ""), ...(options?.data?.username ? { username: String(options.data.username) } : {}), ...(phone ? { phone } : {}) },
                emailRedirectTo: options?.emailRedirectTo,
              },
            }),
            "Supabase sign-up",
          );
          if (result.error) {
            return {
              data: { session: null, user: null },
              error: { message: result.error.message, status: result.error.status },
              emailConfirmationSent: false,
            };
          }
          const sessionToken = result.data.session?.access_token;
          if (sessionToken) {
            // Email confirmations are disabled for this project: the account
            // is active immediately and Supabase sends no verification email.
            // Exchange the access token instead of showing an inbox screen.
            const exchanged = await signInWithSupabaseAccessToken(sessionToken);
            return { ...exchanged, emailConfirmationSent: false };
          }
          // No session means the account awaits email confirmation; Supabase
          // (or its configured SMTP) delivers the verification message.
          return {
            data: { session: null, user: null },
            error: null as AuthError,
            emailConfirmationSent: true,
          };
        } catch (error) {
            if (error instanceof SupabaseWebConfigError || isTimeoutError(error)) {
              // Supabase is not configured in this environment. The legacy app
              // account has no email step: create it and return the session.
              try {
                const payload = await request("/auth/sign-up", {
                  email: trimmed,
                  password,
                  full_name: String(options?.data?.full_name || ""),
                  ...(options?.data?.username ? { username: String(options.data.username) } : {}),
                  ...(phone ? { phone } : {}),
                });
              saveToken(payload.access_token);
              return {
                data: { session: { access_token: payload.access_token }, user: payload.user },
                error: null as AuthError,
                emailConfirmationSent: false,
              };
            } catch (legacyError) {
              return {
                data: { session: null, user: null },
                error: { message: (legacyError as Error).message, status: undefined },
                emailConfirmationSent: false,
              };
            }
          }
          return {
            data: { session: null, user: null },
            error: { message: error instanceof SupabaseWebConfigError ? error.message : emailPasswordAuthErrorMessage(error), status: undefined },
            emailConfirmationSent: false,
          };
        }
      },
      async resend({
        email,
        options,
      }: {
        type: string;
        email: string;
        options?: { emailRedirectTo?: string };
      }) {
        try {
          const result = await supabaseAuthClient().auth.resend({
            type: "signup",
            email,
            options: options?.emailRedirectTo ? { emailRedirectTo: options.emailRedirectTo } : undefined,
          });
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
          const status = (error as { status?: number }).status;
          return { data: { user: null }, error: { message: (error as Error).message, status } };
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

export function isDefinitiveSessionRejection(error: { status?: number } | null | undefined): boolean {
  return error?.status === 401 || error?.status === 403;
}
