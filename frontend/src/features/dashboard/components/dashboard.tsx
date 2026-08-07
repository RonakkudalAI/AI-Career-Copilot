
import { Link } from "@/shared/ui/router-link";
import { useEffect, useState, useSyncExternalStore } from "react";


import { apiRequest } from "@/shared/api/client";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
} from "@/features/profile/model/profile-completion";
import { isDemoSession } from "@/features/auth/demo-session";
import { Card, PageHeader, Progress } from "@/shared/ui/primitives";
import {
  InterviewProgressPanel,
  type InterviewProgress,
} from "@/features/dashboard/components/interview-progress-charts";

type Activity = {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
};

type LatestResumeUpload = {
  resume_id?: string | null;
  title?: string | null;
  filename?: string | null;
  created_at?: string | null;
};

type LatestInterview = {
  id?: string | null;
  label?: string | null;
  status?: string | null;
  at?: string | null;
};

type LatestJobAction = {
  job_id?: string | null;
  label?: string | null;
  title?: string | null;
  company?: string | null;
  status?: string | null;
  is_application?: boolean;
  at?: string | null;
};

type LatestActions = {
  last_resume_upload?: LatestResumeUpload | null;
  last_interview?: LatestInterview | null;
  last_job_applied?: LatestJobAction | null;
};

type Bootstrap = {
  profile: {
    full_name?: string;
    profile_completion?: number;
    profile_completion_details?: { missing?: ProfileMissingItem[] };
  } | null;
  counts: Record<string, number>;
  active_job_description: { title: string; role_title?: string | null } | null;
  latest_ats_analysis: { id: string; overall_score: number | null; status: string } | null;
  latest_actions?: LatestActions | null;
  interview_progress?: InterviewProgress | null;
  capabilities: Record<string, boolean>;
  recent_activity?: Activity[];
  workspace?: {
    profile_completion: number;
    profile_missing?: ProfileMissingItem[];
    profile_completion_details?: { missing?: ProfileMissingItem[] };
    has_active_resume: boolean;
    has_confirmed_resume: boolean;
    failed_ats_count: number;
    ready_for_ats: boolean;
  };
};

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function readDemoMode() {
  return isDemoSession();
}

function subscribeDemoMode() {
  return () => undefined;
}

function ActionRow({
  label,
  value,
  when,
  href,
  empty,
}: {
  label: string;
  value?: string | null;
  when?: string | null;
  href?: string;
  empty: string;
}) {
  return (
    <div className="latest-action-row">
      <div className="latest-action-main">
        <div style={{ minWidth: 0 }}>
          <p className="latest-action-label">{label}</p>
          {value ? (
            <p className="latest-action-value">
              {href ? <Link href={href}>{value}</Link> : value}
            </p>
          ) : (
            <p className="latest-action-empty">{empty}</p>
          )}
        </div>
        {value ? <span className="latest-action-when">{formatWhen(when)}</span> : null}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [configHint, setConfigHint] = useState("");
  const demoMode = useSyncExternalStore(subscribeDemoMode, readDemoMode, () => false);

  useEffect(() => {
    let active = true;
    function load() {
      setError("");
      setConfigHint("");
      apiRequest<Bootstrap>("/me/bootstrap")
        .then((payload) => {
          if (!active) return;
          setData(payload);
        })
        .catch((e: Error) => {
          if (!active) return;
          setData(null);
          setError(e.message || "Could not load dashboard data from the API.");
          setConfigHint(
            "Check that npm run dev is running (frontend + backend), you are signed in, and Firestore is reachable. Open Network for GET /api/backend/me/bootstrap.",
          );
        });
    }
    load();
    function onProfileUpdated() {
      load();
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => {
      active = false;
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
  }, [demoMode]);

  const first = data?.profile?.full_name?.split(" ")[0] || "there";
  const details =
    data?.workspace?.profile_completion_details || data?.profile?.profile_completion_details || null;
  const missing = extractMissing(details, data?.workspace?.profile_missing);
  const completion = resolveCompletion(
    data?.workspace?.profile_completion ?? data?.profile?.profile_completion,
    details,
    missing,
  );
  // Backend retains at most 5; clamp on the client as a hard display guard.
  const activities = (data?.recent_activity || []).slice(0, 5);
  const actions = data?.latest_actions;
  const lastResume = actions?.last_resume_upload;
  const lastInterview = actions?.last_interview;
  const lastJob = actions?.last_job_applied;
  const atsScore =
    data?.latest_ats_analysis?.overall_score == null
      ? null
      : Math.round(Number(data.latest_ats_analysis.overall_score));
  const interviewProgress = data?.interview_progress;
  const interviewLatest = interviewProgress?.latest_overall ?? null;
  const interviewDelta = interviewProgress?.delta ?? null;

  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="Career workspace"
        title={`Welcome, ${first}.`}
        description="A live snapshot of your profile, analyses, interview improvement, and recent activity."
        action={
          <>
            <Link className="button button-secondary" href="/mock-interview">
              Mock interviews
            </Link>
            <Link className="button button-primary" href="/resume-analysis?tab=upload">
              New ATS analysis
            </Link>
          </>
        }
      />

      {demoMode && (
        <div className="feature-alert" data-tone="info" role="status">
          <p className="eyebrow" style={{ margin: 0 }}>
            Demo preview
          </p>
          <p>
            Demo mode uses an in-memory API (not your Firestore account). Sign in with Google or email to load real
            resumes, ATS runs, and activity.
          </p>
        </div>
      )}

      {error && (
        <div className="feature-alert" role="alert">
          <p className="field-error">{error}</p>
          {configHint ? <p className="muted">{configHint}</p> : null}
        </div>
      )}

      {!data && !error && (
        <div className="feature-loading" aria-live="polite">
          Loading account snapshot from the API…
        </div>
      )}

      <section className="dashboard-metrics" aria-label="Account metrics">
        <article className="metric-card">
          <p className="metric-card-label">Resumes</p>
          <div className="metric-value">{data?.counts?.resumes ?? "—"}</div>
          <p className="metric-card-note">
            {data?.workspace?.has_confirmed_resume
              ? "Confirmed resume on file"
              : data
                ? "Confirm a resume to unlock ATS"
                : "—"}
          </p>
          <Link className="metric-card-link" href="/resume-analysis?tab=resumes">
            Manage resumes
          </Link>
        </article>
        <article className="metric-card">
          <p className="metric-card-label">ATS analyses</p>
          <div className="metric-value">{data?.counts?.ats_analyses ?? "—"}</div>
          <p className="metric-card-note">
            {atsScore == null
              ? data
                ? "No completed score yet"
                : "—"
              : `${atsScore}% latest score`}
          </p>
          {data?.latest_ats_analysis?.id ? (
            <Link className="metric-card-link" href={`/resume-analysis/report/${data.latest_ats_analysis.id}`}>
              Open latest report
            </Link>
          ) : (
            <Link className="metric-card-link" href="/resume-analysis?tab=ats">
              Run analysis
            </Link>
          )}
        </article>
        <article className="metric-card metric-card-interview">
          <p className="metric-card-label">Interviews</p>
          <div className="metric-value-row">
            <div className="metric-value">{data?.counts?.interviews ?? "—"}</div>
            {interviewLatest != null ? (
              <span
                className="metric-inline-score"
                title="Latest overall mock interview score"
              >
                {interviewLatest}
                {interviewDelta != null ? (
                  <small data-tone={interviewDelta > 0 ? "up" : interviewDelta < 0 ? "down" : "flat"}>
                    {interviewDelta > 0 ? `+${interviewDelta}` : interviewDelta}
                  </small>
                ) : null}
              </span>
            ) : null}
          </div>
          <p className="metric-card-note">
            {interviewLatest != null
              ? `Latest score ${interviewLatest}/100`
              : data?.capabilities?.interview_evaluation === false
                ? "Practice mode"
                : data
                  ? "Complete a session for scores"
                  : "—"}
          </p>
          <Link className="metric-card-link" href="/mock-interview">
            View sessions
          </Link>
        </article>
        <article className="metric-card">
          <p className="metric-card-label">Job pipeline</p>
          <div className="metric-value">{data?.counts?.saved_jobs ?? "—"}</div>
          <p className="metric-card-note">Saved, applied, and tracked roles</p>
          <Link className="metric-card-link" href="/jobs/saved">
            Open job pipeline
          </Link>
        </article>
      </section>

      {data ? <InterviewProgressPanel progress={interviewProgress} /> : null}

      <section
        className={`dashboard-main ${completion >= 100 ? "is-profile-complete" : ""}`}
        aria-label="Profile and latest progress"
      >
        {completion < 100 ? (
          <Card className="dashboard-panel stack completion-panel">
            <div className="dashboard-panel-head">
              <h2>Profile completion</h2>
              <p className="muted">Finish the checklist so recommendations stay accurate.</p>
            </div>
            <Progress value={completion} label="Profile completion" />
            {missing.length > 0 ? (
              <div className="stack" style={{ gap: 6 }}>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  Still needed ({missing.length}):
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)" }}>
                  {missing.slice(0, 5).map((item) => (
                    <li key={item.key}>{item.label}</li>
                  ))}
                </ul>
                {missing.length > 5 ? (
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                    +{missing.length - 5} more
                  </p>
                ) : null}
              </div>
            ) : null}
            <Link className="button button-secondary" href="/settings/profile" style={{ width: "fit-content" }}>
              Complete profile
            </Link>
          </Card>
        ) : null}

        <Card className="dashboard-panel panel-blue stack">
          <div className="dashboard-panel-head">
            <h2>Latest progress</h2>
            <p className="muted">Your most recent resume, interview, and job action from saved records.</p>
          </div>
          <ActionRow
            label="Last resume uploaded"
            value={lastResume?.title || lastResume?.filename}
            when={lastResume?.created_at}
            href="/resume-analysis?tab=resumes"
            empty="No resume uploaded yet"
          />
          <ActionRow
            label="Last mock interview"
            value={
              lastInterview
                ? `${lastInterview.label || "Mock interview"}${
                    lastInterview.status ? ` · ${lastInterview.status.replaceAll("_", " ")}` : ""
                  }`
                : null
            }
            when={lastInterview?.at}
            href={lastInterview?.id ? `/mock-interview/session/${lastInterview.id}` : "/mock-interview"}
            empty="No mock interview yet"
          />
          <ActionRow
            label={lastJob?.is_application ? "Last job applied" : "Last job saved"}
            value={lastJob?.label || lastJob?.title}
            when={lastJob?.at}
            href={lastJob?.job_id ? `/jobs/${lastJob.job_id}` : "/jobs/saved"}
            empty="No job applications or saved jobs yet"
          />
          {data?.latest_ats_analysis?.id ? (
            <Link className="dashboard-ats-link" href={`/resume-analysis/report/${data.latest_ats_analysis.id}`}>
              Open latest ATS report
              {atsScore != null ? ` (${atsScore}%)` : ""}
            </Link>
          ) : null}
        </Card>
      </section>

      <Card className="stack activity-feed">
        <div className="activity-feed-head">
          <h2>Recent activity</h2>
          <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
            Latest {activities.length}/5
          </span>
        </div>
        {activities.length === 0 ? (
          <p className="feature-status">No saved activity yet. Profile and resume actions will appear here.</p>
        ) : (
          <div className="activity-list">
            {activities.map((item, index) => (
              <div className="activity-item" key={item.id} data-age={index}>
                <p className="activity-item-summary">{item.summary}</p>
                <span className="activity-item-when">{formatWhen(item.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
