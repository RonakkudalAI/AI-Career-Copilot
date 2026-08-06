import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { LandingPage } from "@/features/marketing/components/landing";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { createClient } from "@/features/auth/api/client";
import { isDemoSession } from "@/features/auth/demo-session";
import { safeRedirectPath } from "@/features/auth/safe-path";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/shared/config";
import { Link } from "@/shared/ui/router-link";

const SignInScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({ default: m.SignInScreen })),
);
const SignUpScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({ default: m.SignUpScreen })),
);
const PasswordScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({ default: m.PasswordScreen })),
);
const VerifyEmailScreen = lazy(() =>
  import("@/features/auth/components/auth-screen").then((m) => ({ default: m.VerifyEmailScreen })),
);
const Onboarding = lazy(() =>
  import("@/features/onboarding/components/onboarding").then((m) => ({ default: m.Onboarding })),
);
const Dashboard = lazy(() =>
  import("@/features/dashboard/components/dashboard").then((m) => ({ default: m.Dashboard })),
);
const JobsHome = lazy(() =>
  import("@/features/jobs/components/jobs").then((m) => ({ default: m.JobsHome })),
);
const JobDetail = lazy(() =>
  import("@/features/jobs/components/jobs").then((m) => ({ default: m.JobDetail })),
);
const LearningHome = lazy(() =>
  import("@/features/learning/components/learning").then((m) => ({ default: m.LearningHome })),
);
const LearningPath = lazy(() =>
  import("@/features/learning/components/learning").then((m) => ({ default: m.LearningPath })),
);
const TopicPage = lazy(() =>
  import("@/features/learning/components/learning").then((m) => ({ default: m.TopicPage })),
);
const InterviewHome = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({ default: m.InterviewHome })),
);
const InterviewReport = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({ default: m.InterviewReport })),
);
const InterviewSession = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({ default: m.InterviewSession })),
);
const InterviewSetup = lazy(() =>
  import("@/features/interview/components/interview-flow").then((m) => ({ default: m.InterviewSetup })),
);
const InterviewPreparationHome = lazy(() =>
  import("@/features/interview/components/interview-preparation").then((m) => ({
    default: m.InterviewPreparationHome,
  })),
);
const AnalysisHistory = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({ default: m.AnalysisHistory })),
);
const AtsReport = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({ default: m.AtsReport })),
);
const ExtractionReview = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({ default: m.ExtractionReview })),
);
const NewAnalysis = lazy(() =>
  import("@/features/resume/components/resume-flow").then((m) => ({ default: m.NewAnalysis })),
);
const AccountSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({ default: m.AccountSettings })),
);
const PreferenceSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({ default: m.PreferenceSettings })),
);
const PrivacySettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({ default: m.PrivacySettings })),
);
const ProfileSettings = lazy(() =>
  import("@/features/settings/components/settings").then((m) => ({ default: m.ProfileSettings })),
);

function ProtectedRoute() {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");

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
    void (async () => {
      try {
        const client = createClient();
        const { data, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !data?.user) {
          window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          document.cookie = "career_copilot_session=; Path=/; Max-Age=0; SameSite=Lax";
          setState("no");
          return;
        }
        setState("ok");
      } catch {
        if (!active) return;
        window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        document.cookie = "career_copilot_session=; Path=/; Max-Age=0; SameSite=Lax";
        setState("no");
      }
    })();
    return () => {
      active = false;
    };
  }, [location.pathname]);

  if (state === "loading") {
    return <main className="container" style={{ paddingBlock: "96px" }}>Checking session…</main>;
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
    <WorkspaceShell>
      <Outlet />
    </WorkspaceShell>
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
      const result = await createClient().auth.completeGoogleRedirect();
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
      if (active) setError("Could not complete Google sign-in. Start the sign-in flow again.");
    });
    return () => {
      active = false;
    };
  }, [location.search, navigate]);

  return (
    <main className="container stack" style={{ paddingBlock: "96px" }}>
      {error ? <p role="alert" className="field-error">{error}</p> : "Completing sign-in…"}
    </main>
  );
}

function JobDetailRoute() {
  const { jobId } = useParams<{ jobId: string }>();
  return <JobDetail jobId={jobId || ""} />;
}

function LearningPathRoute() {
  const { pathId } = useParams<{ pathId: string }>();
  return <LearningPath pathId={pathId || ""} />;
}

function TopicRoute() {
  const { topicId } = useParams<{ topicId: string }>();
  return <TopicPage topicId={topicId || ""} />;
}

function NotFoundPage() {
  return (
    <main className="container stack" style={{ paddingBlock: "96px" }}>
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="muted">That Career Copilot page does not exist.</p>
      <Link className="button button-primary" href="/">
        Return home
      </Link>
    </main>
  );
}

export function App() {
  return (
    <Suspense
      fallback={<main className="container" style={{ paddingBlock: "96px" }}>Loading Career Copilot…</main>}
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in" element={<SignInScreen />} />
        <Route path="/sign-up" element={<SignUpScreen />} />
        <Route path="/forgot-password" element={<PasswordScreen />} />
        <Route path="/reset-password" element={<PasswordScreen reset />} />
        <Route path="/verify-email" element={<VerifyEmailScreen />} />
        <Route path="/auth/callback" element={<AuthRedirectRoute />} />
        <Route path="/auth/confirm" element={<AuthRedirectRoute />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<WorkspaceRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/jobs" element={<JobsHome />} />
            <Route path="/jobs/saved" element={<JobsHome savedOnly />} />
            <Route path="/jobs/:jobId" element={<JobDetailRoute />} />
            <Route path="/learning" element={<LearningHome />} />
            <Route path="/learning/:pathId" element={<LearningPathRoute />} />
            <Route path="/learning/topic/:topicId" element={<TopicRoute />} />
            <Route path="/mock-interview" element={<InterviewHome />} />
            <Route path="/mock-interview/preparation" element={<InterviewPreparationHome />} />
            <Route path="/mock-interview/report/:sessionId" element={<InterviewReport />} />
            <Route path="/mock-interview/session/:sessionId" element={<InterviewSession />} />
            <Route path="/mock-interview/setup" element={<InterviewSetup />} />
            <Route path="/resume-analysis" element={<AnalysisHistory />} />
            <Route path="/resume-analysis/new" element={<NewAnalysis />} />
            <Route path="/resume-analysis/report/:reportId" element={<AtsReport />} />
            <Route path="/resume-analysis/review" element={<ExtractionReview />} />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/settings/account" element={<AccountSettings />} />
            <Route path="/settings/preferences" element={<PreferenceSettings />} />
            <Route path="/settings/privacy" element={<PrivacySettings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
