"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Card, PageHeader, Progress } from "@/shared/ui/primitives";
import { apiRequest } from "@/shared/api/client";
import {
  PROFILE_UPDATED_EVENT,
  extractMissing,
  resolveCompletion,
  type ProfileMissingItem,
} from "@/features/profile/model/profile-completion";

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
  return typeof document !== "undefined" && document.cookie.split("; ").includes("career_copilot_demo=1");
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
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="mono" style={{ margin: "0 0 4px", opacity: 0.8 }}>
            {label}
          </p>
          {value ? (
            href ? (
              <Link href={href} style={{ fontWeight: 650 }}>
                {value}
              </Link>
            ) : (
              <p style={{ margin: 0, color: "var(--ink)", fontWeight: 650 }}>{value}</p>
            )
          ) : (
            <p style={{ margin: 0 }}>{empty}</p>
          )}
        </div>
        {value ? <span className="mono muted" style={{ whiteSpace: "nowrap", fontSize: "var(--text-xs)" }}>{formatWhen(when)}</span> : null}
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
    if (demoMode) return;
    let active = true;
    function load() {
      apiRequest<Bootstrap>("/me/bootstrap")
        .then((payload) => {
          if (active) setData(payload);
        })
        .catch((e: Error) => {
          if (!active) return;
          setError(e.message);
          if (/configured|session|unavailable|sign-in/i.test(e.message)) {
            setConfigHint("If this keeps happening, sign out and sign back in, or try again later.");
          }
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

  return (
    <>
      <PageHeader
        eyebrow="Career workspace"
        title={`Welcome, ${first}.`}
        description="A live snapshot of your profile, analyses, interviews, and recent activity."
        action={
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New ATS analysis
          </Link>
        }
      />
      {demoMode && (
        <Card>
          <p className="eyebrow">Demo preview</p>
          <p style={{ margin: 0 }}>You are viewing the dashboard shell without a local authentication session. No account data is loaded or saved.</p>
        </Card>
      )}
      {error && (
        <Card>
          <p role="alert" className="field-error">
            {error}
          </p>
          {configHint && <p className="muted">{configHint}</p>}
        </Card>
      )}
      <div className="grid-4">
        <Card>
          <span className="mono">Resumes</span>
          <div className="metric-value">{data?.counts.resumes ?? "—"}</div>
        </Card>
        <Card>
          <span className="mono">ATS analyses</span>
          <div className="metric-value">{data?.counts.ats_analyses ?? "—"}</div>
          <p>
            {data?.latest_ats_analysis?.overall_score == null
              ? "Ready for confirmed evidence"
              : `${data.latest_ats_analysis.overall_score}/100 latest score`}
          </p>
        </Card>
        <Card>
          <span className="mono">Interviews</span>
          <div className="metric-value">{data?.counts.interviews ?? "—"}</div>
          <p>{data?.capabilities.interview_evaluation === false ? "Practice mode" : "Your sessions"}</p>
        </Card>
        <Card>
          <span className="mono">Saved jobs</span>
          <div className="metric-value">{data?.counts.saved_jobs ?? "—"}</div>
          <p>Saved to your account</p>
        </Card>
      </div>
      <div className={completion >= 100 ? "stack" : "grid-2"} style={{ marginTop: 28 }}>
        <Card className={`stack completion-panel ${completion >= 100 ? "is-complete" : ""}`} aria-hidden={completion >= 100}>
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
          <Link href="/settings/profile">Complete profile</Link>
        </Card>
        <Card className="panel-blue stack">
          <h2 style={{ margin: 0 }}>Latest progress</h2>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Your most recent resume, interview, and job action from saved records.
          </p>
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
            <p style={{ margin: 0 }}>
              <Link href={`/resume-analysis/report/${data.latest_ats_analysis.id}`}>
                Open latest ATS report
                {data.latest_ats_analysis.overall_score != null
                  ? ` (${data.latest_ats_analysis.overall_score}/100)`
                  : ""}
              </Link>
            </p>
          ) : null}
        </Card>
      </div>
      <Card className="stack activity-feed" style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Recent activity</h2>
          <span className="muted mono" style={{ fontSize: "var(--text-xs)" }}>
            Latest {activities.length}/5
          </span>
        </div>
        {activities.length === 0 ? (
          <p style={{ margin: 0 }}>No saved activity yet. Profile and resume actions will appear here.</p>
        ) : (
          <div className="activity-list">
            {activities.map((item, index) => (
              <div
                className="activity-item row"
                key={item.id}
                data-age={index}
                style={{ justifyContent: "space-between" }}
              >
                <span>{item.summary}</span>
                <span className="mono">{formatWhen(item.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
