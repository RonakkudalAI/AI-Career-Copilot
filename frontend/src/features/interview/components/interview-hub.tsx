import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest, isAbortError } from "@/shared/api/client";
import { Button, PageHeader, Textarea } from "@/shared/ui/primitives";
import { createLiveInterview, saveLiveInterview } from "@/features/interview/live-store";
import type { Session } from "@/features/interview/types";
import "@/features/interview/interview.css";

const FOCUS_OPTIONS = [
  { value: "mixed", label: "Mixed", hint: "Stories and skills, the way a real screen usually goes" },
  { value: "behavioural", label: "Behavioural", hint: "Ownership, conflict, and how you work with people" },
  { value: "technical", label: "Technical", hint: "How you break a problem down out loud" },
  { value: "hr", label: "Screening", hint: "Intro, motivation, and how you talk about yourself" },
] as const;

const QUESTION_COUNTS = [3, 5, 8] as const;

type SetupResumeOption = {
  id: string;
  title: string;
  is_active?: boolean;
  latest_version?: {
    id: string;
    original_filename?: string;
    extraction_status?: string;
  } | null;
};

function normalizeSessionList(payload: unknown): Session[] {
  if (Array.isArray(payload)) return payload as Session[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["sessions", "items", "data", "results"]) {
      if (Array.isArray(record[key])) return record[key] as Session[];
    }
  }
  return [];
}

function statusTone(status: string): "success" | "warning" | "info" | "danger" {
  const value = (status || "").toLowerCase();
  if (value === "completed") return "success";
  if (value === "in_progress" || value === "active") return "info";
  if (value === "failed" || value === "cancelled") return "danger";
  return "warning";
}

function formatMode(mode: string) {
  return (mode || "session").replaceAll("_", " ");
}

export function InterviewStartForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedResumeVersionId = searchParams.get("resume_version_id") || "";
  const jobDescriptionId = searchParams.get("job_description_id") || "";
  const [mode, setMode] = useState<(typeof FOCUS_OPTIONS)[number]["value"]>("mixed");
  const [resumeVersionId, setResumeVersionId] = useState(linkedResumeVersionId);
  const [storedResumes, setStoredResumes] = useState<SetupResumeOption[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [targetRole, setTargetRole] = useState(searchParams.get("target_role") || "");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [difficulty, setDifficulty] = useState("balanced");
  const [questionCount, setQuestionCount] = useState(5);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setResumesLoading(true);
    apiRequest<SetupResumeOption[]>("/resumes")
      .then((rows) => {
        if (!active) return;
        const list = rows || [];
        setStoredResumes(list);
        setResumeVersionId((current) => {
          if (current && list.some((row) => row.latest_version?.id === current)) return current;
          const preferred =
            list.find((row) => row.is_active && row.latest_version?.id)?.latest_version?.id ||
            list.find((row) => row.latest_version?.extraction_status === "confirmed")?.latest_version
              ?.id ||
            "";
          return preferred;
        });
      })
      .catch(() => {
        if (active) setStoredResumes([]);
      })
      .finally(() => {
        if (active) setResumesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const resumesWithVersion = storedResumes.filter((row) => row.latest_version?.id);

  function create() {
    setError("");
    const live = createLiveInterview({
      mode,
      target_role: targetRole.trim() || null,
      difficulty: difficulty || "balanced",
      question_count: questionCount,
      camera_enabled: cameraEnabled,
      microphone_enabled: microphoneEnabled,
      job_description_text: jobDescriptionText.trim() || null,
      resume_version_id: resumeVersionId || null,
      job_description_id: jobDescriptionId || null,
    });
    saveLiveInterview(live);
    navigate(`/mock-interview/session/${live.id}`);
  }

  return (
    <form
      className="interview-start"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <div className="interview-start-copy">
        <h2>Start a round</h2>
        <p>Choose a focus, then start.</p>
      </div>

      <fieldset className="interview-focus">
        <legend className="interview-field-label">Interview focus</legend>
        <div className="interview-focus-grid">
          {FOCUS_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <label key={option.value} className={`interview-focus-tile${selected ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="interview-focus"
                  value={option.value}
                  checked={selected}
                  onChange={() => setMode(option.value)}
                />
                <span className="interview-focus-label">{option.label}</span>
                <span className="interview-focus-hint">{option.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="interview-start-grid">
        <label className="interview-field">
          <span className="interview-field-label">
            Role you are practicing for <span className="interview-field-optional">(optional)</span>
          </span>
          <input
            className="field"
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            placeholder="Backend engineer, product designer, data analyst"
            maxLength={200}
            autoComplete="off"
          />
        </label>

        <fieldset className="interview-length">
          <legend className="interview-field-label">How many questions</legend>
          <div className="interview-length-row">
            {QUESTION_COUNTS.map((count) => (
              <label key={count} className={`interview-length-chip${questionCount === count ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="interview-length"
                  value={count}
                  checked={questionCount === count}
                  onChange={() => setQuestionCount(count)}
                />
                {count}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="interview-media-row">
        <label className="interview-toggle">
          <input
            type="checkbox"
            checked={cameraEnabled}
            onChange={(event) => setCameraEnabled(event.target.checked)}
          />
          <span>Camera presence</span>
        </label>
        <label className="interview-toggle">
          <input
            type="checkbox"
            checked={microphoneEnabled}
            onChange={(event) => setMicrophoneEnabled(event.target.checked)}
          />
          <span>Voice answers</span>
        </label>
      </div>

      <details className="interview-extras">
        <summary>Optional context</summary>
        <div className="interview-extras-body">
          <label className="interview-field">
            <span className="interview-field-label">
              Difficulty
            </span>
            <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="easy">Easy</option>
              <option value="balanced">Balanced</option>
              <option value="challenging">Challenging</option>
            </select>
          </label>
          <label className="interview-field">
            <span className="interview-field-label">
              Saved resume <span className="interview-field-optional">optional</span>
            </span>
            {resumesLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Checking saved resumes
              </p>
            ) : resumesWithVersion.length ? (
              <select
                className="field"
                value={resumeVersionId}
                onChange={(event) => setResumeVersionId(event.target.value)}
              >
                <option value="">None — general practice</option>
                {resumesWithVersion.map((row) => (
                  <option key={row.latest_version!.id} value={row.latest_version!.id}>
                    {row.title}
                    {row.is_active ? " (active)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No saved resume yet. You can still start. Add one later if you want questions grounded in your work.
              </p>
            )}
          </label>
          <label className="interview-field">
            <span className="interview-field-label">
              Job description <span className="interview-field-optional">optional</span>
            </span>
            <Textarea
              className="interview-jd-field"
              value={jobDescriptionText}
              onChange={(event: { target: { value: string } }) => setJobDescriptionText(event.target.value)}
              placeholder="Paste a job description if you want questions tied to that posting."
            />
          </label>
        </div>
      </details>

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}

      <div className="interview-start-actions">
        <Button type="submit">Start interview</Button>
        <p className="interview-start-note">
          The interviewer asks, listens to your answer, then follows up when the story needs more.
        </p>
      </div>
    </form>
  );
}

export function InterviewHome() {
  const [data, setData] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadGen = useRef(0);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError("");
    try {
      const rows = normalizeSessionList(
        await apiRequest<Session[] | { sessions?: Session[] }>("/interviews", { signal }),
      );
      if (signal?.aborted || gen !== loadGen.current) return;
      setData(rows);
    } catch (e) {
      if (signal?.aborted || isAbortError(e) || gen !== loadGen.current) return;
      setError((e as Error).message || "Could not load interview sessions.");
    } finally {
      if (!signal?.aborted && gen === loadGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void loadSessions(controller.signal);
    });
    function onVisible() {
      if (document.visibilityState === "visible") void loadSessions();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadSessions]);

  async function deleteSession(session: Session) {
    const label = session.target_role || session.mode || "this";
    const ok = window.confirm(
      `Delete the ${label} interview session permanently? Questions and answers will be removed from your account.`,
    );
    if (!ok) return;
    setDeletingId(session.id);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/interviews/${session.id}`, { method: "DELETE" });
      setData((current) => current.filter((row) => row.id !== session.id));
      setMessage("Interview session deleted.");
    } catch (e) {
      if (!isAbortError(e)) setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="feature-page interview-hub">
      <PageHeader
        title="Practice out loud"
        description="Start a practice session and review past rounds."
      />

      <div className="interview-hub-layout">
        <InterviewStartForm />
        <section className="interview-history" aria-labelledby="interview-history-heading">
          <div className="interview-history-head">
            <div>
              <h2 id="interview-history-heading">Recent sessions</h2>
            </div>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadSessions()}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {error ? (
            <div className="feature-alert" role="alert">
              <p className="field-error">{error}</p>
              <Button type="button" variant="secondary" onClick={() => void loadSessions()}>
                Retry
              </Button>
            </div>
          ) : null}
          {message ? (
            <p className="feature-status" role="status">
              {message}
            </p>
          ) : null}
          {loading && data.length === 0 && !error ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading sessions from your account
            </p>
          ) : null}
          {data.length > 0 ? (
            <ul className="interview-history-list">
              {data.map((session) => (
                <li key={session.id}>
                  <article className="interview-history-item">
                    <div className="interview-history-copy">
                      <h3>{session.target_role || formatMode(session.mode)} interview</h3>
                      <p>
                        {formatMode(session.mode)}
                        {session.question_count != null ? ` · ${session.question_count} questions` : ""}
                        {session.created_at ? ` · ${new Date(session.created_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <span className="status-chip" data-tone={statusTone(session.status)}>
                      {(session.status || "draft").replaceAll("_", " ")}
                    </span>
                    <div className="interview-history-actions">
                      <Link className="button button-secondary" href={`/mock-interview/session/${session.id}`}>
                        Open
                      </Link>
                      {session.status === "completed" ? (
                        <Link className="button button-primary" href={`/mock-interview/report/${session.id}`}>
                          Report
                        </Link>
                      ) : null}
                      <Button
                        variant="destructive"
                        disabled={deletingId === session.id}
                        onClick={() => void deleteSession(session)}
                      >
                        {deletingId === session.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
          {!loading && !error && data.length === 0 ? (
            <p className="interview-history-empty">No sessions yet. Start one from the form.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function InterviewSetup() {
  return (
    <div className="feature-page interview-hub">
      <PageHeader
        title="Set the round, then begin"
        description="Choose a focus and start a practice session."
      />
      <div className="interview-hub-layout is-setup-only">
        <InterviewStartForm />
      </div>
    </div>
  );
}
