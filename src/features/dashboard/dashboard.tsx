"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, PageHeader, Progress } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";

type Activity = {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
};

type Bootstrap = {
  profile: { full_name?: string; profile_completion?: number } | null;
  counts: Record<string, number>;
  active_resume: { title: string } | null;
  active_job_description: { title: string; role_title?: string | null } | null;
  latest_ats_analysis: { id: string; overall_score: number | null; status: string } | null;
  capabilities: Record<string, boolean>;
  recent_activity?: Activity[];
  workspace?: {
    profile_completion: number;
    has_active_resume: boolean;
    has_confirmed_resume: boolean;
    failed_ats_count: number;
    ready_for_ats: boolean;
  };
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function Dashboard() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [configHint, setConfigHint] = useState("");

  useEffect(() => {
    apiRequest<Bootstrap>("/me/bootstrap")
      .then(setData)
      .catch((e: Error) => {
        setError(e.message);
        if (/supabase|configured|session/i.test(e.message)) {
          setConfigHint("Check root .env Supabase values and that migrations are applied.");
        }
      });
  }, []);

  const first = data?.profile?.full_name?.split(" ")[0] || "there";
  const completion = data?.workspace?.profile_completion ?? data?.profile?.profile_completion ?? 0;
  const activities = data?.recent_activity || [];

  return (
    <>
      <PageHeader
        eyebrow="Career workspace"
        title={`Welcome, ${first}.`}
        description="Counts and status below come from your persisted Supabase records."
        action={
          <Link className="button button-primary" href="/resume-analysis?tab=upload">
            New ATS analysis
          </Link>
        }
      />
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
          <p>{data?.active_resume?.title || "No active resume"}</p>
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
          <p>{data?.capabilities.interview_evaluation === false ? "Evaluation unavailable" : "Persisted sessions"}</p>
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
          <Link href="/settings/profile">Review profile</Link>
        </Card>
        <Card className="panel-blue stack">
          <h2 style={{ margin: 0 }}>Workflow readiness</h2>
          <p>
            <strong>Resume:</strong>{" "}
            {data?.workspace?.has_confirmed_resume
              ? data?.active_resume?.title || "Confirmed resume available"
              : "Upload and confirm one"}
          </p>
          <p>
            <strong>Job description:</strong>{" "}
            {data?.active_job_description?.role_title ||
              data?.active_job_description?.title ||
              "Add one before analysis"}
          </p>
          {data?.latest_ats_analysis ? (
            <p>
              <Link href={`/resume-analysis/report/${data.latest_ats_analysis.id}`}>
                Open the latest ATS evidence report
              </Link>
            </p>
          ) : (
            <p>Confirm a resume and job description to calculate keyword coverage.</p>
          )}
        </Card>
      </div>
      <Card className="stack" style={{ marginTop: 28 }}>
        <h2 style={{ margin: 0 }}>Recent activity</h2>
        {activities.length === 0 ? (
          <p style={{ margin: 0 }}>No saved activity yet. Profile and resume actions will appear here.</p>
        ) : (
          activities.map((item) => (
            <div className="row" key={item.id} style={{ justifyContent: "space-between" }}>
              <span>{item.summary}</span>
              <span className="mono">{formatWhen(item.created_at)}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
