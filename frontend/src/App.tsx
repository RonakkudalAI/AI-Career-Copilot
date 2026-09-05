import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { LandingPage } from "@/features/marketing/components/landing";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { WorkspaceBootstrapProvider } from "@/features/workspace/bootstrap-context";
import {
  createClient,
  isDefinitiveSessionRejection,
} from "@/features/auth/api/client";
import { isDemoSession } from "@/features/auth/demo-session";
import { safeRedirectPath } from "@/features/auth/safe-path";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/shared/config";
import { PublicProfile } from "@/features/profile/components/public-profile";
import { CommunityProfiles } from "@/features/community/components/community-profiles";
import { useTheme } from "@/shared/theme";
import {
  ErrorBoundary,
  SystemErrorPanel,
} from "@/components/ui/error-boundary";

function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.href = `/brand/career-copilot-${resolvedTheme}.png`;
    }
  }, [resolvedTheme]);

  return null;
}

const SignInScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({
    default: m.SignInScreen,
  })),
);
const SignUpScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({
    default: m.SignUpScreen,
  })),
);
const PasswordScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({
    default: m.PasswordScreen,
  })),
);
const VerifyEmailScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({
    default: m.VerifyEmailScreen,
  })),
);
const Onboarding = lazy(() =>
  import("@/features/onboarding/components/onboarding").then((m) => ({
    default: m.Onboarding,
  })),
);
const Dashboard = lazy(() =>
  import("@/features/dashboard/components/dashboard").then((m) => ({
    default: m.Dashboard,
  })),
);
const JobsHome = lazy(() =>
  import("@/features/jobs/components/jobs").then((m) => ({
    default: m.JobsHome,
  })),
);
const TeamsPage = lazy(() =>
  import("@/features/marketing/components/teams").then((m) => ({
    default: m.TeamsPage,
  })),
);
const JobDetail = lazy(() =>
  import("@/features/jobs/components/jobs").then((m) => ({
    default: m.JobDetail,
  })),
);
const LearningHome = lazy(() =>
  import("@/features/learning/components/learning").then((m) => ({
    default: m.LearningHome,
  })),
);
const LearningPath = lazy(() =>
  import("@/features/learning/components/learning").then((m) => ({
    default: m.LearningPath,
  })),
);
const InterviewHome = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({
    default: m.InterviewHome,
  })),
);
const InterviewReport = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({
    default: m.InterviewReport,
  })),
);
const InterviewSession = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({
    default: m.InterviewSession,
  })),
);
const InterviewSetup = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({
    default: m.InterviewSetup,
  })),
);
const InterviewPreparationHome = lazy(() =>
  import("@/features/interview/components/interview-preparation").then((m) => ({
    default: m.InterviewPreparationHome,
  })),
);
const AnalysisHistory = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({
    default: m.AnalysisHistory,
  })),
);
const AtsReport = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({
    default: m.AtsReport,
  })),
);
const NewAnalysis = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({
    default: m.NewAnalysis,
  })),
);
const AccountSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({
    default: m.AccountSettings,
  })),
);
const PreferenceSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({
    default: m.PreferenceSettings,
  })),
);
const PrivacySettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({
    default: m.PrivacySettings,
  })),
);
const ProfileSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({
    default: m.ProfileSettings,
  })),
);

function RouteFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <main
      className="container"
      style={{ paddingBlock: "96px" }}
      aria-live="polite"
    >
      {label}
    </main>
  );
}

function WorkspacePageFallback() {
  return (
    <div className="feature-loading" aria-live="polite">
      Loading page…
    </div>
  );
}

/** Isolate lazy-route Suspense so siblings (shell) stay mounted. */
function LazyBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback ?? <RouteFallback />}>{children}</Suspense>
  );
}

function initialAuthState(): "loading" | "ok" | "no" {
  if (typeof window === "undefined") return "loading";
  if (isDemoSession()) return "ok";
  // Optimistic: token present → enter workspace immediately; revalidate once in background.
  if (window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)) return "ok";
  return "no";
}

function ProtectedRoute() {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "no">(initialAuthState);

  // Validate session once per mount — not on every pathname change.
  useEffect(() => {
    let active = true;
    if (isDemoSession()) {
      setState("ok");
      return () => {
        active = false;
      };
    }
    const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (!token) {
      setState("no");
      return () => {
        active = false;
      };
    }
    // Keep UX instant; confirm token against API in background.
    setState("ok");
    void (async () => {
      try {
        const client = createClient();
        const { data, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !data?.user) {
          // Log out only on definitive rejections. Transient server failures
          // (5xx) and unreachable backends keep the optimistic session; later
          // API 401s still fire career-copilot:auth-expired.
          if (!error || isDefinitiveSessionRejection(error)) {
            window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
            setState("no");
          }
        }
      } catch {
        // Transient network failure: do not boot the user out when a token is present.
        // Subsequent API 401s still fire career-copilot:auth-expired.
        if (!active) return;
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onAuthExpired = () => setState("no");
    window.addEventListener("career-copilot:auth-expired", onAuthExpired);
    return () =>
      window.removeEventListener("career-copilot:auth-expired", onAuthExpired);
  }, []);

  if (state === "loading") {
    return <RouteFallback label="Checking session…" />;
  }
  if (state === "no") {
    return (
      <Navigate
        to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <Outlet />;
}

function WorkspaceRoute() {
  return (
    <WorkspaceBootstrapProvider>
      <WorkspaceShell>
        <Suspense fallback={<WorkspacePageFallback />}>
          <Outlet />
        </Suspense>
      </WorkspaceShell>
    </WorkspaceBootstrapProvider>
  );
}

function AuthRedirectRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const next = new URLSearchParams(location.search).get("next");
      const result = await createClient().auth.completeAuthRedirect();
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (!result.data?.session) {
        navigate(safeRedirectPath(next, "/sign-in"), { replace: true });
        return;
      }
      navigate(safeRedirectPath(next, "/dashboard"), { replace: true });
    })().catch(() => {
      if (active)
        setError(
          "Could not complete Google sign-in. Start the sign-in flow again.",
        );
    });
    return () => {
      active = false;
    };
  }, [location.search, navigate]);

  return (
    <main className="container stack" style={{ paddingBlock: "96px" }}>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : (
        "Completing sign-in…"
      )}
    </main>
  );
}

function JobDetailRoute() {
  const { jobId } = useParams<{ jobId: string }>();
  return <JobDetail jobId={jobId || ""} />;
}

function PublicProfileRoute() {
  const { username } = useParams<{ username: string }>();
  return <PublicProfile username={username || ""} />;
}

function LearningPathRoute() {
  const { pathId } = useParams<{ pathId: string }>();
  return <LearningPath pathId={pathId || ""} />;
}

function NotFoundPage() {
  return (
    <SystemErrorPanel
      code="404"
      eyebrow=""
      title="Page not found"
      description="That Career Copilot page does not exist or may have been moved."
      buttonLabel="Return home"
      buttonHref="/"
      secondaryLabel="Go to Dashboard"
      secondaryHref="/dashboard"
    />
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeFavicon />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/teams"
          element={
            <LazyBoundary fallback={<RouteFallback label="Loading team…" />}>
              <TeamsPage />
            </LazyBoundary>
          }
        />
        <Route
          path="/sign-in"
          element={
            <LazyBoundary fallback={<RouteFallback label="Loading sign-in…" />}>
              <SignInScreen />
            </LazyBoundary>
          }
        />
        <Route
          path="/sign-up"
          element={
            <LazyBoundary fallback={<RouteFallback label="Loading sign-up…" />}>
              <SignUpScreen />
            </LazyBoundary>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <LazyBoundary>
              <PasswordScreen />
            </LazyBoundary>
          }
        />
        <Route
          path="/reset-password"
          element={
            <LazyBoundary>
              <PasswordScreen reset />
            </LazyBoundary>
          }
        />
        <Route
          path="/verify-email"
          element={
            <LazyBoundary>
              <VerifyEmailScreen />
            </LazyBoundary>
          }
        />
        <Route path="/auth/callback" element={<AuthRedirectRoute />} />
        <Route path="/auth/confirm" element={<AuthRedirectRoute />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/onboarding"
            element={
              <LazyBoundary>
                <Onboarding />
              </LazyBoundary>
            }
          />
          <Route element={<WorkspaceRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/jobs" element={<JobsHome />} />
            <Route path="/jobs/saved" element={<JobsHome savedOnly />} />
            <Route path="/jobs/:jobId" element={<JobDetailRoute />} />
            <Route path="/community" element={<CommunityProfiles />} />
            <Route path="/learning" element={<LearningHome />} />
            <Route path="/learning/:pathId" element={<LearningPathRoute />} />
            <Route
              path="/learning/topic/:topicId"
              element={<Navigate to="/learning" replace />}
            />
            <Route path="/mock-interview" element={<InterviewHome />} />
            <Route
              path="/mock-interview/preparation"
              element={<InterviewPreparationHome />}
            />
            <Route
              path="/mock-interview/report/:sessionId"
              element={<InterviewReport />}
            />
            <Route
              path="/mock-interview/session/:sessionId"
              element={<InterviewSession />}
            />
            <Route path="/mock-interview/setup" element={<InterviewSetup />} />
            <Route path="/resume-analysis" element={<AnalysisHistory />} />
            <Route path="/resume-analysis/new" element={<NewAnalysis />} />
            <Route
              path="/resume-analysis/report/:reportId"
              element={<AtsReport />}
            />
            <Route
              path="/resume-analysis/review"
              element={<Navigate to="/resume-analysis?tab=upload" replace />}
            />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/settings/account" element={<AccountSettings />} />
            <Route
              path="/settings/preferences"
              element={<PreferenceSettings />}
            />
            <Route path="/settings/privacy" element={<PrivacySettings />} />
          </Route>
        </Route>
        <Route path="/:username" element={<PublicProfileRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
