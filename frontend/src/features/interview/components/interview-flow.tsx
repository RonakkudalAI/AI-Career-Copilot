
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest, isAbortError } from "@/shared/api/client";
import { Button, Card, PageHeader, Textarea } from "@/shared/ui/primitives";
import {
  DEFAULT_ANSWER_SILENCE_MS,
  DEFAULT_LISTEN_AFTER_TTS_MS,
  extractSpeechTranscript,
  mediaReadyMessage,
  mergeSpokenAnswer,
  nextActiveIndex,
  phaseAfterQuestionSpoken,
  sessionMediaFlags,
  shouldAutoSubmitOnSilence,
  type InterviewTurnPhase,
  type SpeechResultListLike,
} from "@/features/interview/interview-voice";

type Session = {
  id: string;
  title?: string;
  mode: string;
  status: string;
  created_at?: string;
  question_count?: number;
  target_role?: string | null;
  camera_enabled?: boolean;
  microphone_enabled?: boolean;
};

type Question = {
  id: string;
  position: number;
  question: string;
  question_type?: string | null;
  source_context?: { provider?: string; model?: string | null } | null;
};

type FillerAnalysis = {
  total_count?: number;
  unique?: string[];
  counts?: Record<string, number>;
  word_count?: number;
  filler_rate?: number;
  notes?: string;
};

type AnswerEvaluation = {
  verdict?: string;
  score?: number;
  interviewer_feedback?: string;
  strengths?: string[];
  improvements?: string[];
  better_approach?: string;
  filler_notes?: string;
  filler_analysis?: FillerAnalysis;
  provider?: string;
};

type InterviewReportPayload = {
  id?: string;
  overall_score?: number | null;
  communication_score?: number | null;
  structure_score?: number | null;
  content_score?: number | null;
  summary?: string | null;
  report?: {
    overall_summary?: string;
    overall_score?: number;
    communication_score?: number;
    structure_score?: number;
    content_score?: number;
    strengths?: string[];
    improvements?: string[];
    practice_plan?: string[];
    filler_summary?: string;
    question_reviews?: Array<{
      question?: string;
      answer?: string;
      score?: number;
      verdict?: string;
      interviewer_feedback?: string;
      strengths?: string[];
      improvements?: string[];
      better_approach?: string;
      filler_analysis?: FillerAnalysis;
    }>;
    provider?: string;
  } | null;
  provider?: string | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex?: number;
  results?: SpeechResultListLike;
};

type SpeechRecognitionErrorEvent = { error?: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

function normalizeSessionList(payload: unknown): Session[] {
  // Backend returns a JSON array; tolerate accidental wrappers so the list
  // never silently empties when one session exists on the dashboard.
  if (Array.isArray(payload)) return payload as Session[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["sessions", "items", "data", "results"]) {
      if (Array.isArray(record[key])) return record[key] as Session[];
    }
  }
  return [];
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
      const rows = normalizeSessionList(await apiRequest<Session[] | { sessions?: Session[] }>("/interviews", { signal }));
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
    // Re-sync when returning from a completed session or switching tabs —
    // dashboard bootstrap and this list share the same Firestore collection.
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadSessions();
      }
    }
    function onFocus() {
      void loadSessions();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
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

  function statusTone(status: string): "success" | "warning" | "info" | "danger" {
    const value = (status || "").toLowerCase();
    if (value === "completed") return "success";
    if (value === "in_progress" || value === "active") return "info";
    if (value === "failed" || value === "cancelled") return "danger";
    return "warning";
  }

  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="Practice"
        title="Interview sessions"
        description="Sessions and questions are stored in your account. Practice questions are generated when AI is available."
        action={
          <>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadSessions()}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Link className="button button-secondary" href="/mock-interview/preparation">
              Prepare first
            </Link>
            <Link className="button button-primary" href="/mock-interview/setup">
              Create session
            </Link>
          </>
        }
      />
      {error && (
        <div className="feature-alert" role="alert">
          <p className="field-error">{error}</p>
          <div className="cluster">
            <Button type="button" variant="secondary" onClick={() => void loadSessions()}>
              Retry
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p className="feature-status" role="status">
          {message}
        </p>
      )}
      {loading && data.length === 0 && !error && (
        <div className="feature-loading" aria-live="polite">
          Loading interview sessions from your account…
        </div>
      )}
      {data.length > 0 && (
        <div className="entity-list">
          {data.map((s) => (
            <article key={s.id} className="entity-card panel">
              <div className="entity-card-head">
                <div>
                  <h2>{s.target_role || s.mode} interview</h2>
                  <p className="entity-card-meta">
                    {(s.mode || "session").replaceAll("_", " ")}
                    {s.question_count != null ? ` · ${s.question_count} questions` : ""}
                    {s.created_at ? ` · ${new Date(s.created_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <span className="status-chip" data-tone={statusTone(s.status)}>
                  {(s.status || "draft").replaceAll("_", " ")}
                </span>
              </div>
              <div className="entity-card-actions">
                <Link className="button button-secondary" href={`/mock-interview/session/${s.id}`}>
                  Open session
                </Link>
                {s.status === "completed" ? (
                  <Link className="button button-primary" href={`/mock-interview/report/${s.id}`}>
                    View report
                  </Link>
                ) : null}
                <Button
                  variant="destructive"
                  disabled={deletingId === s.id}
                  onClick={() => void deleteSession(s)}
                >
                  {deletingId === s.id ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && data.length === 0 && (
        <Card className="empty-state">
          <h2>No sessions yet</h2>
          <p>Create a practice session to begin.</p>
        </Card>
      )}
    </div>
  );
}

export function InterviewSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeVersionId = searchParams.get("resume_version_id") || "";
  const jobDescriptionId = searchParams.get("job_description_id") || "";
  const [mode, setMode] = useState(resumeVersionId && jobDescriptionId ? "resume_and_jd" : "behavioural");
  const [targetRole, setTargetRole] = useState(searchParams.get("target_role") || "");
  const [questionCount, setQuestionCount] = useState(3);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
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
          resume_version_id: resumeVersionId || null,
          job_description_id: jobDescriptionId || null,
          target_role: targetRole.trim() || null,
          difficulty: "balanced",
          duration_minutes: 15,
          question_count: questionCount,
          camera_enabled: cameraEnabled,
          microphone_enabled: microphoneEnabled,
          recording_consent: false,
        }),
      });
      await apiRequest(`/interviews/${s.id}/start`, { method: "POST" });
      navigate(`/mock-interview/session/${s.id}`);
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
        description="Choose a mode and role. In the session, the interviewer asks aloud, your spoken answer appears as text, and the next question starts automatically after you pause."
      />
      <Card className="stack">
        {resumeVersionId && jobDescriptionId ? <p role="status" className="muted" style={{ margin: 0 }}>This session will use the confirmed resume and job description selected in preparation.</p> : null}
        <label className="field-label">
          Mode
          <select className="field" value={mode} onChange={(e: any) => setMode(e.target.value)}>
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
            onChange={(e: any) => setTargetRole(e.target.value)}
            placeholder="e.g. Backend Engineer"
          />
        </label>
        <label className="field-label">
          Number of questions
          <select
            className="field"
            value={questionCount}
            onChange={(e: any) => setQuestionCount(Number(e.target.value))}
          >
            {[3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted" style={{ margin: 0 }}>
            Camera and microphone are used only for the live practice session. No interview media is recorded or stored.
          </p>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={cameraEnabled} onChange={(e) => setCameraEnabled(e.target.checked)} />
            Enable camera
          </label>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={microphoneEnabled} onChange={(e) => setMicrophoneEnabled(e.target.checked)} />
            Enable microphone and voice answers
          </label>
        </div>
        {error && <p className="field-error">{error}</p>}
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create session"}
        </Button>
      </Card>
    </>
  );
}

export function InterviewSession() {
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = String(params?.sessionId || "");
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Finalized answer text (typed + speech finals). */
  const [answer, setAnswer] = useState("");
  /** Live partial speech — shown in the answer box while speaking. */
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [questionSource, setQuestionSource] = useState("");
  const [mediaMessage, setMediaMessage] = useState("");
  const [phase, setPhase] = useState<InterviewTurnPhase>("idle");
  const [autoVoice, setAutoVoice] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [lastFeedback, setLastFeedback] = useState<AnswerEvaluation | null>(null);
  const [lastAnswerSnapshot, setLastAnswerSnapshot] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const phaseRef = useRef<InterviewTurnPhase>("idle");
  const answerRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const keepListeningRef = useRef(false);
  const submittingRef = useRef(false);
  const activeIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const autoVoiceRef = useRef(true);

  const current = questions[activeIndex];
  const media = sessionMediaFlags(session || {});
  /** Live view: committed answer + current interim so speech is visible while talking. */
  const liveTranscript = interim ? (answer ? `${answer} ${interim}` : interim) : answer;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);
  useEffect(() => {
    autoVoiceRef.current = autoVoice;
  }, [autoVoice]);

  const stopRecognition = useCallback((opts?: { keepPhase?: boolean }) => {
    keepListeningRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        try {
          rec.abort?.();
        } catch {
          /* ignore */
        }
      }
    }
    if (!opts?.keepPhase && phaseRef.current === "listening") {
      setPhase("idle");
    }
  }, []);

  const startListening = useCallback(() => {
    if (!media.microphone) {
      setMediaMessage("Microphone is disabled for this session. Type your answer.");
      setPhase("idle");
      return;
    }
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setSpeechSupported(false);
      setMediaMessage("Voice answers are not supported in this browser. Type your answer instead.");
      setPhase("idle");
      return;
    }
    setSpeechSupported(true);

    // Never capture TTS of the question.
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    // Replace any existing recognizer.
    keepListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    lastSpeechAtRef.current = Date.now();
    keepListeningRef.current = true;

    recognition.onresult = (event) => {
      lastSpeechAtRef.current = Date.now();
      const { finalChunk, interimText } = extractSpeechTranscript(
        event.results,
        typeof event.resultIndex === "number" ? event.resultIndex : 0,
      );
      setAnswer((prev) => {
        const merged = mergeSpokenAnswer(prev, finalChunk, "");
        answerRef.current = merged.committed;
        return merged.committed;
      });
      setInterim(interimText);
      setMediaMessage("Listening… your words appear in the answer box as you speak.");
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || "");
      // "no-speech" / "aborted" are normal; keep trying while in listen mode.
      if (code === "not-allowed" || code === "service-not-allowed") {
        keepListeningRef.current = false;
        setMediaMessage("Microphone permission was denied. Enable it in the browser, or type your answer.");
        setPhase("idle");
        return;
      }
      if (code === "network") {
        setMediaMessage("Speech recognition network error. Check connectivity or type your answer.");
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // Chrome often ends continuous sessions after a pause — restart while we still want input.
      if (keepListeningRef.current && phaseRef.current === "listening") {
        window.setTimeout(() => {
          if (!keepListeningRef.current || phaseRef.current !== "listening") return;
          try {
            const again = new Constructor();
            again.lang = "en-US";
            again.interimResults = true;
            again.continuous = true;
            again.onresult = recognition.onresult;
            again.onerror = recognition.onerror;
            again.onend = recognition.onend;
            recognitionRef.current = again;
            again.start();
          } catch {
            keepListeningRef.current = false;
            setPhase("idle");
            setMediaMessage("Voice input stopped. Press “Answer by voice” or type your answer.");
          }
        }, 120);
        return;
      }
      if (phaseRef.current === "listening") setPhase("idle");
    };

    recognitionRef.current = recognition;
    setPhase("listening");
    setInterim("");
    setMediaMessage("Listening… speak your answer. It will appear below.");
    try {
      recognition.start();
    } catch {
      keepListeningRef.current = false;
      recognitionRef.current = null;
      setPhase("idle");
      setMediaMessage("Voice input could not be started. Type your answer or try again.");
    }
  }, [media.microphone]);

  const speakQuestion = useCallback(
    (text: string, after?: () => void) => {
      stopRecognition({ keepPhase: true });
      setPhase("asking");
      setInterim("");
      if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
        setMediaMessage("Text-to-speech is not available. Read the question and answer below.");
        after?.();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setPhase("asking");
      utterance.onend = () => {
        after?.();
      };
      utterance.onerror = () => {
        after?.();
      };
      window.speechSynthesis.speak(utterance);
      setMediaMessage("Asking the question…");
    },
    [stopRecognition],
  );

  const completeSession = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<{ session?: Session; report?: InterviewReportPayload; message?: string }>(
        `/interviews/${sessionId}/complete`,
        { method: "POST" },
      );
      setMessage(result.message || "Session complete. Opening your debrief report…");
      setSession((s) => (s ? { ...s, status: "completed" } : s));
      setPhase("complete");
      setMediaMessage("Session complete. Review the detailed report.");
      navigate(`/mock-interview/report/${sessionId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [navigate, sessionId]);

  const advanceAfterFeedback = useCallback(async () => {
    setLastFeedback(null);
    const next = nextActiveIndex(activeIndexRef.current, questionsRef.current.length);
    if (next === null) {
      setPhase("complete");
      setMediaMessage("All questions answered. Building your debrief report…");
      await completeSession();
      return;
    }
    setPhase("between");
    setActiveIndex(next);
  }, [completeSession]);

  const submitCurrentAnswer = useCallback(
    async () => {
      const q = questionsRef.current[activeIndexRef.current];
      const text = answerRef.current.trim();
      if (!q || !text || submittingRef.current) return;
      submittingRef.current = true;
      keepListeningRef.current = false;
      stopRecognition({ keepPhase: true });
      setInterim("");
      setPhase("saving");
      setSaving(true);
      setError("");
      setMessage("");
      try {
        const result = await apiRequest<{
          response?: unknown;
          evaluation?: AnswerEvaluation;
          question?: Question;
        }>(`/interviews/${sessionId}/responses`, {
          method: "POST",
          body: JSON.stringify({
            question_id: q.id,
            typed_response: text,
            transcript: text,
          }),
        });
        const evaluation = result.evaluation || null;
        setLastFeedback(evaluation);
        setLastAnswerSnapshot(text);
        setMessage("Answer saved. Review the interviewer feedback, then continue.");
        setPhase("feedback");
        setMediaMessage("Interviewer feedback is ready. Continue when you have read it.");
        // Optional spoken feedback (short) — does not block the flow.
        if (evaluation?.interviewer_feedback && typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(
              evaluation.interviewer_feedback.slice(0, 280),
            );
            window.speechSynthesis.speak(utter);
          } catch {
            /* ignore TTS errors */
          }
        }
      } catch (e) {
        setError((e as Error).message);
        setPhase("idle");
      } finally {
        setSaving(false);
        submittingRef.current = false;
      }
    },
    [sessionId, stopRecognition],
  );

  // Load session + questions
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
              ? "Questions generated for this session"
              : ctx.provider === "template"
                ? "Standard practice questions"
                : "Questions for this session",
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

  // Camera / microphone stream
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const flags = sessionMediaFlags(session);
    if (!flags.camera && !flags.microphone) {
      setMediaMessage(mediaReadyMessage(false, false));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaMessage("This browser does not support camera or microphone access.");
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({ video: flags.camera, audio: flags.microphone })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current && flags.camera) {
          videoRef.current.srcObject = stream;
        }
        setMediaMessage(mediaReadyMessage(flags.camera, flags.microphone));
      })
      .catch(() => {
        if (!cancelled) {
          setMediaMessage(
            "Camera or microphone permission was not granted. You can still type answers.",
          );
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [session]);

  // Attach stream if video element mounts later
  useEffect(() => {
    if (!media.camera || !videoRef.current || !streamRef.current) return;
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [media.camera, current?.id]);

  // Auto ask → listen loop when the active question changes (skip while feedback is open)
  useEffect(() => {
    if (loading || !current?.question || session?.status === "completed") return;
    if (phaseRef.current === "feedback" || phaseRef.current === "saving") return;
    let cancelled = false;
    setAnswer("");
    answerRef.current = "";
    setInterim("");
    setMessage("");
    setLastFeedback(null);
    setLastAnswerSnapshot("");

    const afterSpoken = () => {
      if (cancelled) return;
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoiceRef.current);
      if (nextPhase === "listening") {
        window.setTimeout(() => {
          if (!cancelled) startListening();
        }, DEFAULT_LISTEN_AFTER_TTS_MS);
      } else {
        setPhase("idle");
        setMediaMessage(
          media.microphone
            ? "Press “Answer by voice” or type your answer, then save."
            : "Type your answer, then save to continue.",
        );
      }
    };

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      speakQuestion(current.question, afterSpoken);
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      stopRecognition({ keepPhase: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on question change
  }, [current?.id, loading, session?.status]);

  // Silence → auto-save → next question (back-and-forth)
  useEffect(() => {
    if (phase !== "listening") return;
    const id = window.setInterval(() => {
      const msSince = Date.now() - lastSpeechAtRef.current;
      if (
        shouldAutoSubmitOnSilence({
          phase: phaseRef.current,
          committedAnswer: answerRef.current,
          msSinceLastSpeech: msSince,
          silenceMs: DEFAULT_ANSWER_SILENCE_MS,
        })
      ) {
        void submitCurrentAnswer();
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [phase, submitCurrentAnswer]);

  useEffect(
    () => () => {
      keepListeningRef.current = false;
      stopRecognition({ keepPhase: true });
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopRecognition],
  );

  function toggleVoiceAnswer() {
    if (phase === "listening" || recognitionRef.current) {
      stopRecognition();
      setMediaMessage("Listening stopped. Edit your answer or save to continue.");
      return;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    startListening();
  }

  function askQuestionAloud() {
    if (!current?.question) return;
    speakQuestion(current.question, () => {
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoice);
      if (nextPhase === "listening") startListening();
      else setPhase("idle");
    });
  }

  function onAnswerChange(value: string) {
    setAnswer(value);
    answerRef.current = value;
    setInterim("");
    lastSpeechAtRef.current = Date.now();
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
      navigate("/mock-interview");
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

  const phaseLabel =
    phase === "asking"
      ? "Interviewer is asking…"
      : phase === "listening"
        ? "Your turn — speak now"
        : phase === "saving"
          ? "Saving & evaluating…"
          : phase === "feedback"
            ? "Interviewer feedback"
            : phase === "complete"
              ? "Session complete"
              : "Ready";

  return (
    <>
      <PageHeader
        eyebrow="Interview session"
        title={session?.target_role ? `${session.target_role} practice` : "Practice workspace"}
        description={`${session?.mode || "mixed"} · ${session?.status || "unknown"} · ${questions.length} question(s)${questionSource ? ` · ${questionSource}` : ""}`}
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
      {questionSource ? (
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          {questionSource}
        </p>
      ) : null}
      <Card className="stack">
        <div className="cluster" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ margin: 0 }}>Live practice</h2>
            <p className="muted" style={{ margin: 0 }}>
              {mediaMessage || "Questions are spoken aloud; your spoken answers appear in the box below."}
            </p>
            <p style={{ margin: 0, fontWeight: 600 }}>{phaseLabel}</p>
            {!speechSupported ? (
              <p className="field-error" style={{ margin: 0 }}>
                This browser has no Web Speech recognition (try Chrome/Edge). Typing still works.
              </p>
            ) : null}
          </div>
          {media.camera ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: 220, maxWidth: "100%", borderRadius: 12, background: "#0b1930" }}
            />
          ) : null}
        </div>
        <label className="cluster" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={autoVoice}
            onChange={(e) => setAutoVoice(e.target.checked)}
            disabled={!media.microphone}
          />
          Automatic back-and-forth (speak question → listen → save on silence → next question)
        </label>
        <div className="cluster">
          <Button variant="secondary" onClick={askQuestionAloud} disabled={!current || phase === "asking" || phase === "saving"}>
            {phase === "asking" ? "Asking question…" : "Ask question aloud"}
          </Button>
          {media.microphone ? (
            <Button
              variant="secondary"
              onClick={toggleVoiceAnswer}
              disabled={!current || phase === "asking" || phase === "saving"}
            >
              {phase === "listening" ? "Stop listening" : "Answer by voice"}
            </Button>
          ) : null}
        </div>
      </Card>
      {!questions.length ? (
        <Card className="stack">
          <p>No questions are available for this session yet.</p>
          <p className="muted" style={{ margin: 0 }}>
            Start the session again, or create a new session.
          </p>
          <Button variant="destructive" disabled={deleting} onClick={() => void deleteThisSession()}>
            {deleting ? "Deleting…" : "Delete session"}
          </Button>
        </Card>
      ) : (
        <Card className="stack">
          <p className="mono" style={{ margin: 0 }}>
            Question {activeIndex + 1} of {questions.length}
            {current?.question_type ? ` · ${current.question_type}` : ""}
          </p>
          <h2 style={{ margin: 0 }}>{current?.question}</h2>
          <label className="field-label">
            Your answer {phase === "listening" ? "(updates as you speak)" : ""}
            <Textarea
              value={liveTranscript}
              onChange={(e: { target: { value: string } }) => onAnswerChange(e.target.value)}
              placeholder={
                media.microphone
                  ? "Speak after the question, or type here. Spoken words appear as you talk."
                  : "Type your answer here."
              }
            />
          </label>
          {phase === "listening" ? (
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }} role="status">
              {interim
                ? `Hearing now: “${interim}”`
                : answer
                  ? "Listening for more… pause ~2s when finished to auto-save and go to the next question."
                  : "Listening… start speaking. Your words will show above."}
            </p>
          ) : null}
          <div className="cluster">
            <Button
              disabled={saving || !answer.trim() || phase === "asking" || phase === "feedback"}
              onClick={() => void submitCurrentAnswer()}
            >
              {saving ? "Evaluating…" : "Submit answer"}
            </Button>
            <Button
              variant="secondary"
              disabled={activeIndex <= 0 || phase === "saving" || phase === "asking" || phase === "feedback"}
              onClick={() => {
                stopRecognition();
                setActiveIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button variant="secondary" disabled={saving || deleting || phase === "feedback"} onClick={() => void completeSession()}>
              Complete session
            </Button>
            <Button variant="destructive" disabled={saving || deleting} onClick={() => void deleteThisSession()}>
              {deleting ? "Deleting…" : "Delete session"}
            </Button>
          </div>
        </Card>
      )}
      {phase === "feedback" && lastFeedback ? (
        <Card className="stack">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Interviewer feedback</h2>
            <span className="status-chip" data-tone={
              (lastFeedback.score ?? 0) >= 70 ? "success" : (lastFeedback.score ?? 0) >= 45 ? "info" : "warning"
            }>
              {(lastFeedback.verdict || "reviewed").replaceAll("_", " ")}
              {lastFeedback.score != null ? ` · ${lastFeedback.score}/100` : ""}
            </span>
          </div>
          {lastAnswerSnapshot ? (
            <div>
              <p className="mono" style={{ margin: "0 0 6px" }}>Your answer</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--ink)" }}>{lastAnswerSnapshot}</p>
            </div>
          ) : null}
          <p style={{ margin: 0, color: "var(--ink)", fontWeight: 500 }}>
            {lastFeedback.interviewer_feedback}
          </p>
          {lastFeedback.strengths && lastFeedback.strengths.length > 0 ? (
            <div>
              <strong>What worked</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {lastFeedback.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastFeedback.improvements && lastFeedback.improvements.length > 0 ? (
            <div>
              <strong>How to improve</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {lastFeedback.improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastFeedback.better_approach ? (
            <div>
              <strong>Stronger approach</strong>
              <p style={{ margin: "6px 0 0" }}>{lastFeedback.better_approach}</p>
            </div>
          ) : null}
          {lastFeedback.filler_analysis ? (
            <div className="panel-blue" style={{ padding: 14, borderRadius: 12 }}>
              <strong>Speech habits</strong>
              <p style={{ margin: "6px 0 0" }}>
                {lastFeedback.filler_notes || lastFeedback.filler_analysis.notes}
              </p>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                Fillers detected: {lastFeedback.filler_analysis.total_count ?? 0}
                {lastFeedback.filler_analysis.unique?.length
                  ? ` (${lastFeedback.filler_analysis.unique.join(", ")})`
                  : ""}
              </p>
            </div>
          ) : null}
          <div className="cluster">
            <Button onClick={() => void advanceAfterFeedback()} disabled={saving}>
              {activeIndex >= questions.length - 1 ? "Finish & open report" : "Next question"}
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export function InterviewReport() {
  const params = useParams();
  const sessionId = String(params?.sessionId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [reportRow, setReportRow] = useState<InterviewReportPayload | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    apiRequest<{ session: Session; report: InterviewReportPayload }>(`/interviews/${sessionId}/report`)
      .then((payload) => {
        if (!active) return;
        setSession(payload.session);
        setReportRow(payload.report);
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

  const body = reportRow?.report;
  const overall = body?.overall_score ?? reportRow?.overall_score;
  const reviews = body?.question_reviews || [];

  if (loading) {
    return (
      <Card>
        <p>Loading interview report…</p>
      </Card>
    );
  }

  if (error || !reportRow) {
    return (
      <>
        <PageHeader
          eyebrow="Interview report"
          title="Report unavailable"
          description="Complete a mock interview session to generate a detailed debrief."
        />
        <Card className="empty-state">
          <h2>No report yet</h2>
          <p>{error || "Finish the session to store questions, answers, and coach feedback."}</p>
          <Link className="button button-primary" href="/mock-interview">
            Back to sessions
          </Link>
        </Card>
      </>
    );
  }

  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="Interview report"
        title={session?.target_role ? `${session.target_role} debrief` : "Mock interview debrief"}
        description="Questions asked, your answers, filler habits, and how to improve — stored for this session."
        action={
          <Link className="button button-secondary" href="/mock-interview">
            All sessions
          </Link>
        }
      />
      <div className="dashboard-metrics" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <article className="metric-card">
          <p className="metric-card-label">Overall</p>
          <div className="metric-value">{overall ?? "—"}</div>
        </article>
        <article className="metric-card">
          <p className="metric-card-label">Communication</p>
          <div className="metric-value">{body?.communication_score ?? reportRow.communication_score ?? "—"}</div>
        </article>
        <article className="metric-card">
          <p className="metric-card-label">Structure</p>
          <div className="metric-value">{body?.structure_score ?? reportRow.structure_score ?? "—"}</div>
        </article>
        <article className="metric-card">
          <p className="metric-card-label">Content</p>
          <div className="metric-value">{body?.content_score ?? reportRow.content_score ?? "—"}</div>
        </article>
      </div>
      <Card className="stack">
        <h2 style={{ margin: 0 }}>Summary</h2>
        <p style={{ margin: 0 }}>{body?.overall_summary || reportRow.summary}</p>
        {body?.filler_summary ? (
          <p className="muted" style={{ margin: 0 }}>
            {body.filler_summary}
          </p>
        ) : null}
      </Card>
      {body?.strengths && body.strengths.length > 0 ? (
        <Card className="stack">
          <h2 style={{ margin: 0 }}>Strengths</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {body.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {body?.improvements && body.improvements.length > 0 ? (
        <Card className="stack">
          <h2 style={{ margin: 0 }}>Improvements</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {body.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {body?.practice_plan && body.practice_plan.length > 0 ? (
        <Card className="stack">
          <h2 style={{ margin: 0 }}>Practice plan</h2>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {body.practice_plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </Card>
      ) : null}
      <div className="entity-list">
        {reviews.map((review, index) => (
          <article key={`${review.question}-${index}`} className="entity-card panel stack">
            <div className="entity-card-head">
              <h2>Q{index + 1}. {review.question}</h2>
              <span className="status-chip" data-tone="info">
                {(review.verdict || "reviewed").replaceAll("_", " ")}
                {review.score != null ? ` · ${review.score}` : ""}
              </span>
            </div>
            <div>
              <p className="mono" style={{ margin: "0 0 4px" }}>Your answer</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{review.answer || "—"}</p>
            </div>
            {review.interviewer_feedback ? (
              <p style={{ margin: 0 }}>{review.interviewer_feedback}</p>
            ) : null}
            {review.better_approach ? (
              <p className="muted" style={{ margin: 0 }}>
                <strong>Stronger approach:</strong> {review.better_approach}
              </p>
            ) : null}
            {review.filler_analysis?.total_count != null ? (
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                Fillers: {review.filler_analysis.total_count}
                {review.filler_analysis.unique?.length
                  ? ` (${review.filler_analysis.unique.join(", ")})`
                  : ""}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
