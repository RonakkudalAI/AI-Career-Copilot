"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, MailCheck } from "lucide-react";
import { Button, Input } from "@/shared/ui/primitives";
import { createClient } from "@/features/auth/api/client";

function Shell({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return (
    <main id="main-content" className="auth-shell">
      <aside className="auth-aside">
        <Link className="brand" href="/">
          Career Copilot
        </Link>
        <div>
          <p className="eyebrow">Your career workspace</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </aside>
      <section className="auth-main">{children}</section>
    </main>
  );
}

function configurationError() {
  return "Sign-in is not available right now. Please try again later.";
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return "Your email is not verified yet. Open the verification link from your inbox, then try signing in again.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect. If you just created the account, verify your email first.";
  }
  return message;
}

export function SignInScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    search.get("error") === "configuration_required" ? configurationError() : "",
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
      const result = await authClient.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        const normalized = result.error.message.toLowerCase();
        setNeedsVerification(normalized.includes("email not confirmed"));
        return setError(authErrorMessage(result.error.message));
      }
      router.replace(search.get("next") || "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach authentication. Check your connection and try again.");
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
    setVerificationMessage("");
    try {
      const result = await authClient.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      setVerificationMessage("A new verification email was requested. Check spam or promotions too.");
    } catch {
      setError("Could not request a verification email. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: "google" | "linkedin_oidc") {
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    try {
      const { error: oauthError } = await authClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (oauthError) setError(authErrorMessage(oauthError.message));
    } catch {
      setError("Could not reach authentication. Check your connection and try again.");
    }
  }
  return (
    <Shell title="Welcome back." description="Sign in to open your private career records and continue where you left off.">
      <form className="auth-card panel stack" onSubmit={submit}>
        <div>
          <p className="eyebrow">Secure sign in</p>
          <h1>Sign in</h1>
        </div>
        <label className="field-label">
          Email
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field-label">
          Password
          <div className="password-field">
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-reveal"
              aria-label="Hold to show password"
              title="Hold to show password"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                setShowPassword(true);
              }}
              onPointerUp={() => setShowPassword(false)}
              onPointerLeave={() => setShowPassword(false)}
              onPointerCancel={() => setShowPassword(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Eye size={18} aria-hidden />
            </button>
          </div>
        </label>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {verificationMessage && <p role="status" className="badge badge-success">{verificationMessage}</p>}
        {needsVerification && (
          <Button type="button" variant="secondary" disabled={busy} onClick={resendVerification}>
            Resend verification email
          </Button>
        )}
        <div className="row">
          <span />
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
        <Button disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <div className="auth-divider">or</div>
        <div className="grid-2">
          <Button type="button" variant="secondary" onClick={() => oauth("google")}>
            Continue with Google
          </Button>
          <Button type="button" variant="secondary" onClick={() => oauth("linkedin_oidc")}>
            Continue with LinkedIn
          </Button>
        </div>
        <p>
          New here?{" "}
          <Link href="/sign-up">
            <strong>Create an account</strong>
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setBusy(true);
    setError("");
    try {
      const result = await authClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      if (result.data.session) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach authentication. Check your connection and try again.");
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
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
      });
      if (result.error) return setError(authErrorMessage(result.error.message));
      setResendMessage("A new verification email was requested. Check spam or promotions too.");
    } catch {
      setError("Could not request a verification email. Check your connection and try again.");
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
        <div className="auth-card panel empty-state">
          <MailCheck size={44} />
          <h1>Check your inbox</h1>
          <p>Open the verification link we sent to activate your account.</p>
          {error && <p role="alert" className="field-error">{error}</p>}
          {resendMessage && <p role="status" className="badge badge-success">{resendMessage}</p>}
          <Button type="button" variant="secondary" disabled={busy} onClick={resendVerification}>
            {busy ? "Requesting email…" : "Resend verification email"}
          </Button>
          <p className="muted">If it does not arrive, check spam or promotions folders, then try resending the verification email.</p>
        </div>
      ) : (
        <form className="auth-card panel stack" onSubmit={submit}>
          <p className="eyebrow">Create account</p>
          <h1>Get started</h1>
          <label className="field-label">
            Full name
            <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field-label">
            Email
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field-label">
            Password
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field-label">
            Confirm password
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <p>
            Already registered?{" "}
            <Link href="/sign-in">
              <strong>Sign in</strong>
            </Link>
          </p>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmailScreen() {
  return (
    <Shell title="Confirm your email." description="We sent a verification link to finish setting up your account.">
      <div className="auth-card panel empty-state">
        <MailCheck size={44} />
        <h1>Check your inbox</h1>
        <p>Open the verification link to continue. If it expired, return to sign up and request a new message.</p>
        <Link className="button button-secondary" href="/sign-in">
          Back to sign in
        </Link>
      </div>
    </Shell>
  );
}

export function PasswordScreen({ reset = false }: { reset?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const authClient = createClient();
    if (!authClient) return setError(configurationError());
    setError("");
    try {
      if (reset) {
        if (password !== confirm) return setError("Passwords do not match.");
        const result = await authClient.auth.updateUser({ password });
        if (result.error) return setError(authErrorMessage(result.error.message));
        router.replace("/dashboard");
        router.refresh();
      } else {
        const result = await authClient.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
        });
        if (result.error) return setError(authErrorMessage(result.error.message));
        setMessage("If the address is registered, a recovery link has been sent.");
      }
    } catch {
      setError("Could not reach authentication. Check your connection and try again.");
    }
  }
  return (
    <Shell
      title={reset ? "Choose a new password." : "Reset your password."}
      description="We will email you a secure link when recovery is needed."
    >
      <form className="auth-card panel stack" onSubmit={submit}>
        <h1>{reset ? "Choose a new password" : "Reset your password"}</h1>
        {reset ? (
          <>
            <label className="field-label">
              New password
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field-label">
              Confirm password
              <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="field-label">
            Email
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="badge badge-success">
            {message}
          </p>
        )}
        <Button type="submit">{reset ? "Update password" : "Send reset link"}</Button>
      </form>
    </Shell>
  );
}
