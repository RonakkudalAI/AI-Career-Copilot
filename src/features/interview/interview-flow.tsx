"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, PageHeader, Textarea } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api/client";

type Session = {
  id: string;
  title?: string;
  mode: string;
  status: string;
  created_at?: string;
  question_count?: number;
  target_role?: string | null;
};

type Question = {
  id: string;
  position: number;
  question: string;
  question_type?: string | null;
  source_context?: { provider?: string; model?: string | null } | null;
};

export function InterviewHome() {
  const [data, setData] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadSessions(signal?: AbortSignal) {
    const rows = await apiRequest<Session[]>("/interviews", { signal });
    if (!signal?.aborted) setData(rows);
  }

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void loadSessions(controller.signal).catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    });
    return () => controller.abort();
  }, []);

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
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Persisted practice"
        title="Interview sessions"
        description="Sessions and questions are stored in your account. Practice questions are generated with Groq when configured."
        action={
          <a className="button button-primary" href="/mock-interview/setup">
            Create session
          </a>
        }
      />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {data.map((s) => (
        <Card key={s.id} className="stack">
          <h2 style={{ margin: 0 }}>{s.target_role || s.mode} interview</h2>
          <p style={{ margin: 0 }}>
            {s.mode} · {s.status}
          </p>
          <div className="cluster">
            <a className="button button-secondary" href={`/mock-interview/session/${s.id}`}>
              Open session
            </a>
            <Button
              variant="danger"
              disabled={deletingId === s.id}
              onClick={() => void deleteSession(s)}
            >
              {deletingId === s.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </Card>
      ))}
      {!error && data.length === 0 && (
        <Card className="empty-state">
          <h2>No sessions yet</h2>
          <p>Create a practice session to begin.</p>
        </Card>
      )}
    </>
  );
}

export function InterviewSetup() {
  const router = useRouter();
  const [mode, setMode] = useState("behavioural");
  const [targetRole, setTargetRole] = useState("");
  const [questionCount, setQuestionCount] = useState(3);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const s = await apiRequest<Session>("/interviews", {
        method: "POST",
        body: JSON.stringify({
          mode,
          target_role: targetRole.trim() || null,
          difficulty: "balanced",
          duration_minutes: 15,
          question_count: questionCount,
          camera_enabled: false,
          microphone_enabled: false,
          recording_consent: false,
        }),
      });
      await apiRequest(`/interviews/${s.id}/start`, { method: "POST" });
      router.push(`/mock-interview/session/${s.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Interview setup"
        title="Create a practice session"
        description="Questions are generated with Groq when GROQ_API_KEY is set. NVIDIA is used only for resume AI tasks, not as a fallback here."
      />
      <Card className="stack">
        <label className="field-label">
          Mode
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="behavioural">Behavioural</option>
            <option value="technical">Technical</option>
            <option value="mixed">Mixed</option>
            <option value="hr">HR</option>
          </select>
        </label>
        <label className="field-label">
          Target role (optional)
          <input
            className="field"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Backend Engineer"
          />
        </label>
        <label className="field-label">
          Number of questions
          <select
            className="field"
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          >
            {[3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="field-error">{error}</p>}
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create session"}
        </Button>
      </Card>
    </>
  );
}

export function InterviewSession() {
  const router = useRouter();
  const params = useParams();
  const sessionId = String(params?.sessionId || "");
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [questionSource, setQuestionSource] = useState<string>("");

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    apiRequest<{ session: Session; questions: Question[] }>(`/interviews/${sessionId}`)
      .then((payload) => {
        if (!active) return;
        setSession(payload.session);
        setQuestions(payload.questions || []);
        const ctx = payload.questions?.[0]?.source_context;
        if (ctx?.provider) {
          setQuestionSource(
            ctx.provider === "groq"
              ? `Questions from Groq agent${ctx.model ? ` (${ctx.model})` : ""}`
              : ctx.provider === "template"
                ? "Questions from local templates (Groq unavailable or not configured)"
                : `Questions from ${ctx.provider}`,
          );
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const current = questions[activeIndex];

  async function submitResponse() {
    if (!current || !response.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/interviews/${sessionId}/responses`, {
        method: "POST",
        body: JSON.stringify({
          question_id: current.id,
          typed_response: response.trim(),
        }),
      });
      setMessage("Response saved.");
      setResponse("");
      if (activeIndex < questions.length - 1) setActiveIndex((i) => i + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function completeSession() {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/interviews/${sessionId}/complete`, { method: "POST" });
      setMessage("Session marked complete.");
      setSession((s) => (s ? { ...s, status: "completed" } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteThisSession() {
    const ok = window.confirm(
      "Delete this interview session permanently? Questions and answers will be removed from your account.",
    );
    if (!ok) return;
    setDeleting(true);
    setError("");
    try {
      await apiRequest(`/interviews/${sessionId}`, { method: "DELETE" });
      router.replace("/mock-interview");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <p>Loading session…</p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Interview session"
        title={session?.target_role ? `${session.target_role} practice` : "Practice workspace"}
        description={`${session?.mode || "mixed"} · ${session?.status || "unknown"} · ${questions.length} question(s)${questionSource ? ` · ${questionSource}` : ""}`}
      />
      {error && <p className="field-error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {questionSource ? (
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          {questionSource}
        </p>
      ) : null}
      {!questions.length ? (
        <Card className="stack">
          <p>No questions are available for this session yet.</p>
          <p className="muted" style={{ margin: 0 }}>
            Start the session again after configuring GROQ_API_KEY, or create a new session.
          </p>
        </Card>
      ) : (
        <Card className="stack">
          <p className="mono" style={{ margin: 0 }}>
            Question {activeIndex + 1} of {questions.length}
            {current?.question_type ? ` · ${current.question_type}` : ""}
          </p>
          <h2 style={{ margin: 0 }}>{current?.question}</h2>
          <label className="field-label">
            Your answer
            <Textarea value={response} onChange={(e) => setResponse(e.target.value)} />
          </label>
          <div className="cluster">
            <Button disabled={saving || !response.trim()} onClick={() => void submitResponse()}>
              {saving ? "Saving…" : "Save answer"}
            </Button>
            <Button
              variant="secondary"
              disabled={activeIndex <= 0}
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={activeIndex >= questions.length - 1}
              onClick={() => setActiveIndex((i) => Math.min(questions.length - 1, i + 1))}
            >
              Next
            </Button>
            <Button variant="secondary" disabled={saving || deleting} onClick={() => void completeSession()}>
              Complete session
            </Button>
            <Button variant="danger" disabled={saving || deleting} onClick={() => void deleteThisSession()}>
              {deleting ? "Deleting…" : "Delete session"}
            </Button>
          </div>
        </Card>
      )}
      {questions.length === 0 ? (
        <div className="cluster" style={{ marginTop: 12 }}>
          <Button variant="danger" disabled={deleting} onClick={() => void deleteThisSession()}>
            {deleting ? "Deleting…" : "Delete session"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function InterviewReport() {
  return (
    <>
      <PageHeader
        eyebrow="Interview report"
        title="Evaluation unavailable"
        description="No evaluator is configured, so no communication, visual, technical, or readiness scores were generated."
      />
      <Card className="empty-state">
        <h2>No report exists</h2>
        <p>Completing a session stores its status without inventing feedback.</p>
      </Card>
    </>
  );
}
