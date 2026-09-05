import { Link } from "@/shared/ui/router-link";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "@/shared/router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowRight, Eye, EyeOff, MailCheck } from "lucide-react";
import { AnimatedIcon } from "@/components/ui/animated-icon";

import { createClient } from "@/features/auth/api/client";
import { safeRedirectPath } from "@/features/auth/safe-path";
import { Button, Input } from "@/shared/ui/primitives";
import {
  PhoneField,
  isValidPhone,
  composePhone,
  type PhoneValue,
} from "@/shared/ui/phone-field";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { BrandMark } from "@/components/ui/brand-mark";
import { CareerIcon } from "@/components/ui/career-icons";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { resolveApiBase } from "@/shared/config";
import { authCallbackUrl } from "@/features/auth/public-origin";

function Shell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <main id="main-content" className="auth-shell atlas-auth-shell">
      <aside
        className="auth-aside atlas-auth-aside"
        aria-label="Product overview"
      >
        <AuroraBackground className="auth-aurora">
          <Link className="brand atlas-auth-brand" href="/">
            <BrandMark />
            <span>Career Copilot</span>
          </Link>
          <div className="auth-aside-copy">
            <h1>{title}</h1>
            <p>{description}</p>
            <ul className="auth-aside-points">
              <li>
                <CareerIcon name="evidence" size={17} />{" "}
                <span>Review every score against evidence you control</span>
              </li>
              <li>
                <CareerIcon name="interview" size={17} />{" "}
                <span>Practice interviews with a live transcript</span>
              </li>
              <li>
                <CareerIcon name="opportunities" size={17} />{" "}
                <span>See roles matched to your confirmed profile</span>
              </li>
            </ul>
          </div>
        </AuroraBackground>
      </aside>
      <section className="auth-main atlas-auth-main">
        <div className="auth-main-inner">
          <div className="auth-theme-control atlas-auth-theme-control">
            <ThemeToggle compact />
          </div>
          <div className="auth-bezel">{children}</div>
        </div>
      </section>
    </main>
  );
}

function submitOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target instanceof HTMLTextAreaElement) return;
  if (target.closest(".phone-country-pop")) return;
  if (
    target instanceof HTMLButtonElement &&
    target.getAttribute("type") !== "submit"
  )
    return;
  if (!(target instanceof HTMLInputElement)) return;
  event.preventDefault();
  if (typeof event.currentTarget.requestSubmit === "function") {
    event.currentTarget.requestSubmit();
  } else {
    event.currentTarget.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }
}

function configurationError() {
  return "Sign-in is not available right now. Please try again later.";
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return "Your email is not verified yet. Open the verification link from your inbox, then try signing in again.";
  }
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("email or password is incorrect")
  ) {
    return "The email or password is incorrect. If you just created the account, verify your email first.";
  }
  if (
    normalized.includes("over_email_send_rate_limit") ||
    normalized.includes("rate limit")
  ) {
    return "Too many verification emails were requested for this address. Wait about an hour, then use the resend button.";
  }
  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (normalized.includes("email_address_invalid")) {
    return "That email address was rejected by the authentication provider. Check the spelling or use a different address.";
  }
  return message;
}

function GoogleMark() {
  return (
    <svg
      className="google-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.72-.06-1.41-.18-2.07H12v3.92h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.85-1.7 2.9-4.2 2.9-7.24Z"
      />
      <path
        fill="#34A853"
        d="M12 21.72c2.64 0 4.86-.87 6.48-2.36l-3.15-2.45c-.87.58-1.98.92-3.33.92-2.56 0-4.73-1.73-5.51-4.06H3.24v2.53A9.79 9.79 0 0 0 12 21.72Z"
      />
      <path
        fill="#FBBC05"
        d="M6.49 13.77A5.88 5.88 0 0 1 6.18 12c0-.61.11-1.21.31-1.77V7.7H3.24A9.77 9.77 0 0 0 2.2 12c0 1.57.38 3.05 1.04 4.3l3.25-2.53Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.17c1.44 0 2.73.5 3.75 1.48l2.81-2.81C16.86 3.27 14.64 2.28 12 2.28a9.79 9.79 0 0 0-8.76 5.42l3.25 2.53C7.27 7.9 9.44 6.17 12 6.17Z"
      />
    </svg>
  );
}

export function SignInScreen() {
  const navigate = useNavigate();
  const search = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    search.get("error") === "configuration_required"
      ? configurationError()
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setBusy(true);
    setError("");
    setVerificationMessage("");
    setNeedsVerification(false);
    setShowPassword(false);
    try {
      const result = await authClient.auth.signInWithPassword({
        identifier: identifier.trim(),
        password,
      });
      if (result.error) {
        const normalized = result.error.message.toLowerCase();
        setNeedsVerification(
          normalized.includes("email not confirmed") ||
            normalized.includes("email not verified") ||
            normalized.includes("verify your email"),
        );
        return setError(authErrorMessage(result.error.message));
      }
      navigate(safeRedirectPath(search.get("next"), "/dashboard"));
    } catch {
      setError(
        "Could not reach authentication. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    const address = identifier.trim();
    if (!address) return setError("Enter your email address first.");
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setBusy(true);
    setError("");
    setVerificationMessage("");
    try {
      const result = await authClient.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: authCallbackUrl("/onboarding") },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      setVerificationMessage(
        "A new verification email was requested. Check spam or promotions too.",
      );
    } catch {
      setError(
        "Could not request a verification email. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: "google" | "linkedin_oidc") {
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    try {
      const next = safeRedirectPath(search.get("next"), "/dashboard");
      const result = await authClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authCallbackUrl(next) },
      });
      const oauthError = result.error;
      if (oauthError) setError(authErrorMessage(oauthError.message));
      else if (provider === "google" && result.data?.session) {
        navigate(safeRedirectPath(search.get("next"), "/dashboard"));
      }
    } catch {
      setError(
        "Could not reach authentication. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell
      title="Welcome back."
      description="Sign in to open your private career records and continue where you left off."
    >
      <form
        className="auth-card panel stack atlas-auth-card"
        onSubmit={submit}
        onKeyDown={submitOnEnter}
      >
        <div className="atlas-auth-card-header">
          <h1>Sign in</h1>
        </div>
        <label className="field-label">
          Email, phone, or username
          <Input
            autoComplete="username"
            required
            value={identifier}
            onChange={(e: any) => setIdentifier(e.target.value)}
            placeholder="you@example.com or @username"
          />
        </label>
        <label className="field-label">
          Password
          <div className="password-field">
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-reveal"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              title={showPassword ? "Hide password" : "Show password"}
              data-testid="password-visibility-toggle"
              onPointerDown={(event) => {
                event.preventDefault();
                setShowPassword(true);
              }}
              onPointerUp={() => setShowPassword(false)}
              onPointerLeave={() => setShowPassword(false)}
              onPointerCancel={() => setShowPassword(false)}
              onBlur={() => setShowPassword(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setShowPassword(true);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  setShowPassword(false);
              }}
            >
              <AnimatedIcon
                icon={showPassword ? EyeOff : Eye}
                size={18}
                aria-hidden
              />
            </button>
          </div>
        </label>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {verificationMessage && (
          <p role="status" className="badge badge-success">
            {verificationMessage}
          </p>
        )}
        {needsVerification && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={resendVerification}
          >
            Resend verification email
          </Button>
        )}
        <Button disabled={busy} type="submit" className="auth-cta">
          <span>{busy ? "Signing in…" : "Sign in"}</span>
          {busy ? null : (
            <span className="auth-cta-orb" aria-hidden>
              <ArrowRight size={14} strokeWidth={1.75} />
            </span>
          )}
        </Button>
        <div className="auth-divider">or</div>
        <div className="auth-oauth">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void oauth("google");
            }}
          >
            <GoogleMark /> Continue with Google
          </Button>
        </div>
        <p className="auth-switch">
          New here? <Link href="/sign-up">Create an account</Link>
        </p>
      </form>
    </Shell>
  );
}

export function SignUpScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameAvailability, setUsernameAvailability] = useState<{
    available: boolean;
    reason?: string;
    suggestions?: string[];
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState<PhoneValue>({ iso2: "IN", national: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const usernameSuggestions = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join("_");

  useEffect(() => {
    const value = username.trim().toLowerCase().replace(/^@/, "");
    if (value.length < 3) {
      setUsernameAvailability(
        value
          ? { available: false, reason: "Use at least 3 characters." }
          : null,
      );
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `${resolveApiBase()}/public/username-availability?username=${encodeURIComponent(value)}`,
        { signal: controller.signal },
      )
        .then((response) => response.json())
        .then(
          (result: {
            available?: boolean;
            reason?: string;
            suggestions?: string[];
          }) =>
            setUsernameAvailability({
              available: Boolean(result.available),
              reason: result.reason,
              suggestions: result.suggestions,
            }),
        )
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    if (!isValidPhone(phone))
      return setError(
        "Enter a valid mobile number (6–15 digits) with its country code.",
      );
    if (!username.trim() || usernameAvailability?.available === false)
      return setError(
        usernameAvailability?.reason || "Choose an available username.",
      );
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setBusy(true);
    setError("");
    try {
      const result = await authClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            ...(username.trim()
              ? { username: username.trim().replace(/^@/, "").toLowerCase() }
              : {}),
          },
          emailRedirectTo: authCallbackUrl("/onboarding"),
          phone: composePhone(phone),
        },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      if (result.data.session?.access_token) {
        // The account is active immediately (email confirmations disabled, or
        // a legacy app account): skip the inbox screen and go straight in.
        navigate("/onboarding");
        return;
      }
      setSent(true);
    } catch {
      setError(
        "Could not reach authentication. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    const address = email.trim();
    if (!address) return setError("Enter your email address first.");
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setBusy(true);
    setError("");
    setResendMessage("");
    try {
      const result = await authClient.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: authCallbackUrl("/onboarding") },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      setResendMessage(
        "A new verification email was requested. Check spam or promotions too.",
      );
    } catch {
      setError(
        "Could not request a verification email. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell
      title="Create your account."
      description="Your records stay private. Review what is saved before it powers another workflow."
    >
      {sent ? (
        <div className="auth-card panel empty-state atlas-auth-card">
          <AnimatedIcon icon={MailCheck} size={44} />
          <h1>Check your inbox</h1>
          <p>Open the verification link we sent to activate your account.</p>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {resendMessage && (
            <p role="status" className="badge badge-success">
              {resendMessage}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={resendVerification}
          >
            {busy ? "Requesting email…" : "Resend verification email"}
          </Button>
          <p className="muted">
            Delivery is handled by the authentication provider and can take a
            few minutes. Check spam and promotions folders too; if nothing
            arrives after resending, the project&apos;s SMTP settings may need
            attention.
          </p>
        </div>
      ) : (
        <form
          className="auth-card panel stack atlas-auth-card atlas-auth-signup-card"
          onSubmit={submit}
          onKeyDown={submitOnEnter}
        >
          <div className="atlas-auth-card-header">
            <h1>Create account</h1>
          </div>
          <label className="field-label">
            Full name
            <Input
              required
              minLength={2}
              value={name}
              onChange={(e: any) => setName(e.target.value)}
            />
          </label>
          <label className="field-label">
            Email
            <Input
              type="email"
              required
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
            />
          </label>
          <label className="field-label">
            Username
            <Input
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e: any) => setUsername(e.target.value)}
              placeholder={usernameSuggestions || "your_name"}
            />
            {usernameAvailability ? (
              <span
                className={
                  usernameAvailability.available
                    ? "field-hint field-hint-success"
                    : "field-error"
                }
              >
                {usernameAvailability.available
                  ? "Username is available."
                  : usernameAvailability.reason}
              </span>
            ) : (
              <span className="field-hint">
                Your public profile will be /{usernameSuggestions || "username"}
                .
              </span>
            )}
            {!usernameAvailability?.available &&
            usernameAvailability?.suggestions?.length ? (
              <span className="username-suggestions">
                Try:{" "}
                {usernameAvailability.suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => setUsername(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </span>
            ) : null}
          </label>
          <PhoneField
            label="Mobile number"
            required
            value={phone}
            onChange={setPhone}
          />
          <label className="field-label">
            Password
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
            />
          </label>
          <label className="field-label">
            Confirm password
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e: any) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit" className="auth-cta">
            <span>{busy ? "Creating account…" : "Create account"}</span>
            {busy ? null : (
              <span className="auth-cta-orb" aria-hidden>
                <ArrowRight size={14} strokeWidth={1.75} />
              </span>
            )}
          </Button>
          <p className="auth-switch">
            Already registered? <Link href="/sign-in">Sign in</Link>
          </p>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmailScreen() {
  return (
    <Shell
      title="Confirm your email."
      description="We sent a verification link to finish setting up your account."
    >
      <div className="auth-card panel empty-state atlas-auth-card">
        <AnimatedIcon icon={MailCheck} size={44} />
        <h1>Check your inbox</h1>
        <p>
          Open the verification link to continue. If it expired, return to sign
          up and request a new message.
        </p>
        <Link className="button button-secondary" href="/sign-in">
          Back to sign in
        </Link>
      </div>
    </Shell>
  );
}

export function PasswordScreen({ reset = false }: { reset?: boolean }) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setError("");
    try {
      if (!reset) return;
      if (password !== confirm) return setError("Passwords do not match.");
      if (!currentPassword.trim())
        return setError("Enter your current password.");
      const result = await authClient.auth.updateUser({
        password,
        current_password: currentPassword,
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      navigate("/dashboard");
    } catch {
      setError(
        "Could not reach authentication. Check your connection and try again.",
      );
    }
  }
  return (
    <Shell
      title={reset ? "Choose a new password." : "Reset your password."}
      description={
        reset
          ? "Confirm your current password, then choose a new one."
          : "Password recovery email is not configured for this deployment."
      }
    >
      <form
        className="auth-card panel stack atlas-auth-card"
        onSubmit={submit}
        onKeyDown={submitOnEnter}
      >
        <div className="atlas-auth-card-header">
          <h1>{reset ? "Choose a new password" : "Reset your password"}</h1>
        </div>
        {reset ? (
          <>
            <label className="field-label">
              Current password
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e: any) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="field-label">
              New password
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
              />
            </label>
            <label className="field-label">
              Confirm password
              <Input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e: any) => setConfirm(e.target.value)}
              />
            </label>
          </>
        ) : (
          <p className="muted">
            Password recovery email is not configured for this deployment. Sign
            in with your current password or contact the workspace
            administrator.
          </p>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {reset ? (
          <Button type="submit">Update password</Button>
        ) : (
          <p className="feature-status">
            Recovery is not enabled for this deployment.{" "}
            <Link href="/sign-in">Return to sign in</Link> or contact your
            workspace administrator.
          </p>
        )}
        {!reset && (
          <p className="auth-switch">
            Remembered it? <Link href="/sign-in">Sign in</Link>
          </p>
        )}
      </form>
    </Shell>
  );
}
