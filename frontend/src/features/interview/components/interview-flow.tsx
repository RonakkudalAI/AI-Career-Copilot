
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest, isAbortError } from "@/shared/api/client";
import { Button, Card, PageHeader, Textarea } from "@/shared/ui/primitives";
import {
  DEFAULT_ANSWER_SILENCE_MS,
  DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS,
  DEFAULT_LISTEN_AFTER_TTS_MS,
  analyzeLiveSpeaking,
  buildProceedPrompt,
  buildShortInterviewerLine,
  extractSpeechTranscript,
  isHoldIntent,
  isProceedIntent,
  mediaReadyMessage,
  mergeSpokenAnswer,
  nextActiveIndex,
  phaseAfterFeedbackSpoken,
  phaseAfterQuestionSpoken,
  scheduleListenAfterQuestionSpoken,
  sessionMediaFlags,
  shouldAutoSubmitOnSilence,
  type InterviewTurnPhase,
  type LiveSpeakingMetrics,
  type SpeechResultListLike,
} from "@/features/interview/interview-voice";
import {
  classifyFaceLooking,
  createFaceDetector,
  liveGazeCoachMessage,
  summarizeGazeSamples,
  type FaceDetectorLike,
  type GazeSample,
  type GazeSessionSummary,
} from "@/features/interview/interview-gaze";
import { ScoreRing } from "@/features/dashboard/components/interview-progress-charts";

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

type SpeakingDelivery = {
  word_count?: number;
  duration_seconds?: number | null;
  words_per_minute?: number | null;
  pace_band?: string;
  pace_notes?: string;
  filler_count?: number;
  filler_rate?: number;
  filler_notes?: string;
};

type GazeMetricsPayload = {
  sample_count?: number;
  looking_samples?: number;
  away_samples?: number;
  no_face_samples?: number;
  looking_ratio?: number | null;
  looking_seconds?: number;
  away_seconds?: number;
  eye_contact_score?: number | null;
  band?: string;
  notes?: string;
  detector?: string;
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
  speaking_delivery?: SpeakingDelivery;
  gaze_metrics?: GazeMetricsPayload | null;
  provider?: string;
};

type PracticeReadiness = {
  band?: string;
  label?: string;
  composite_score?: number;
  next_step?: string;
  disclaimer?: string;
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
    speaking_summary?: {
      average_words_per_minute?: number | null;
      total_fillers?: number;
      total_words?: number;
      filler_rate?: number;
    };
    gaze_summary?: {
      average_eye_contact_score?: number | null;
      looking_samples?: number;
      away_samples?: number;
      answers_with_gaze?: number;
      notes?: string;
    };
    practice_readiness?: PracticeReadiness;
    score_series?: Array<{ position?: number; score?: number; label?: string }>;
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
      speaking_delivery?: SpeakingDelivery;
      gaze_metrics?: GazeMetricsPayload | null;
    }>;
    provider?: string;
    generation_status?: "ai_generated" | "evidence_only" | "evidence_only_ai_unavailable" | string;
    report_version?: string;
  } | null;
  provider?: string | null;
  generation_status?: string | null;
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
  const [mode, setMode] = useState(
    resumeVersionId && jobDescriptionId ? "resume_and_jd" : "mixed",
  );
  const [targetRole, setTargetRole] = useState(searchParams.get("target_role") || "");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [difficulty, setDifficulty] = useState("balanced");
  const [questionCount, setQuestionCount] = useState(5);
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
          job_description_text: jobDescriptionText.trim() || null,
          target_role: targetRole.trim() || null,
          target_company: targetCompany.trim() || null,
          difficulty: difficulty || "balanced",
          duration_minutes: Math.max(10, questionCount * 4),
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
        description="Pick a mode, optional target role, and paste a job description if you have one. The session is stored in your account; questions are generated from your inputs only (no invented career history)."
      />
      <Card className="stack">
        {resumeVersionId && jobDescriptionId ? (
          <p role="status" className="muted" style={{ margin: 0 }}>
            Linked to confirmed resume and job description from preparation. You can still paste extra JD text below.
          </p>
        ) : null}
        <label className="field-label">
          Interview mode
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="mixed">Mixed (recommended)</option>
            <option value="behavioural">Behavioural</option>
            <option value="technical">Technical</option>
            <option value="hr">HR / screening</option>
            <option value="role">Role-focused</option>
            <option value="resume_and_jd">Resume + job description</option>
          </select>
        </label>
        <label className="field-label">
          Target role
          <input
            className="field"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Backend Engineer"
            maxLength={200}
          />
        </label>
        <label className="field-label">
          Target company (optional)
          <input
            className="field"
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
            maxLength={200}
          />
        </label>
        <label className="field-label">
          Paste job description (optional)
          <Textarea
            value={jobDescriptionText}
            onChange={(e: { target: { value: string } }) => setJobDescriptionText(e.target.value)}
            placeholder="Paste the JD text here. Questions will only use requirements written in this text — nothing invented."
          />
        </label>
        <div className="cluster" style={{ gap: 16, flexWrap: "wrap" }}>
          <label className="field-label" style={{ flex: "1 1 160px" }}>
            Difficulty
            <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="balanced">Balanced</option>
              <option value="challenging">Challenging</option>
            </select>
          </label>
          <label className="field-label" style={{ flex: "1 1 160px" }}>
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
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted" style={{ margin: 0 }}>
            Camera is for live practice only (preview). Speech recognition uses the browser mic separately so answers are not blocked. Nothing is recorded to storage.
          </p>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={cameraEnabled} onChange={(e) => setCameraEnabled(e.target.checked)} />
            Enable camera preview
          </label>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={microphoneEnabled} onChange={(e) => setMicrophoneEnabled(e.target.checked)} />
            Enable microphone and voice answers
          </label>
        </div>
        {error && <p className="field-error">{error}</p>}
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Creating session…" : "Create session & start"}
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
  const [liveMetrics, setLiveMetrics] = useState<LiveSpeakingMetrics | null>(null);
  const [gazeSummary, setGazeSummary] = useState<GazeSessionSummary | null>(null);
  const [gazeCoach, setGazeCoach] = useState<string | null>(null);
  const [gazeSupported, setGazeSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const phaseRef = useRef<InterviewTurnPhase>("idle");
  const answerRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const listenStartedAtRef = useRef(0);
  const keepListeningRef = useRef(false);
  const submittingRef = useRef(false);
  const advancingRef = useRef(false);
  const activeIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const autoVoiceRef = useRef(true);
  /** Bumps on every startListening so stale onend restarts cannot steal the mic. */
  const listenGenerationRef = useRef(0);
  const gazeSamplesRef = useRef<GazeSample[]>([]);
  const gazeDetectorRef = useRef<FaceDetectorLike | null>(null);
  const recentGazeStatesRef = useRef<GazeSample["state"][]>([]);

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

    // Never capture TTS of the question — cancel synthesis before opening recognition.
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }

    // Replace any existing recognizer.
    keepListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const generation = ++listenGenerationRef.current;
    const recognition = new Constructor();
    recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    lastSpeechAtRef.current = Date.now();
    listenStartedAtRef.current = Date.now();
    keepListeningRef.current = true;

    const bindHandlers = (instance: SpeechRecognitionLike) => {
      instance.onresult = (event) => {
        if (listenGenerationRef.current !== generation) return;
        lastSpeechAtRef.current = Date.now();
        const { finalChunk, interimText } = extractSpeechTranscript(
          event.results,
          typeof event.resultIndex === "number" ? event.resultIndex : 0,
        );
        setAnswer((prev) => {
          const merged = mergeSpokenAnswer(prev, finalChunk, "");
          answerRef.current = merged.committed;
          const elapsed = Date.now() - listenStartedAtRef.current;
          const display = mergeSpokenAnswer(merged.committed, "", interimText).display;
          setLiveMetrics(analyzeLiveSpeaking(display, elapsed));
          return merged.committed;
        });
        setInterim(interimText);
        setMediaMessage("Listening… your words appear in the answer box as you speak.");
      };

      instance.onerror = (event) => {
        if (listenGenerationRef.current !== generation) return;
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
        if (code === "audio-capture") {
          keepListeningRef.current = false;
          setMediaMessage("No microphone was found. Connect a mic or type your answer.");
          setPhase("idle");
        }
      };

      instance.onend = () => {
        if (recognitionRef.current === instance) {
          recognitionRef.current = null;
        }
        if (listenGenerationRef.current !== generation) return;
        // Chrome often ends continuous sessions after a pause — restart while we still want input.
        if (keepListeningRef.current && phaseRef.current === "listening") {
          window.setTimeout(() => {
            if (
              listenGenerationRef.current !== generation ||
              !keepListeningRef.current ||
              phaseRef.current !== "listening"
            ) {
              return;
            }
            try {
              const again = new Constructor();
              again.lang = recognition.lang;
              again.interimResults = true;
              again.continuous = true;
              bindHandlers(again);
              recognitionRef.current = again;
              again.start();
            } catch {
              keepListeningRef.current = false;
              setPhase("idle");
              setMediaMessage("Voice input stopped. Press “Answer by voice” or type your answer.");
            }
          }, 160);
          return;
        }
        if (phaseRef.current === "listening") setPhase("idle");
      };
    };

    bindHandlers(recognition);
    recognitionRef.current = recognition;
    setPhase("listening");
    setInterim("");
    setLiveMetrics(analyzeLiveSpeaking("", 0));
    setMediaMessage("Listening… speak your answer. It will appear below.");
    try {
      recognition.start();
    } catch {
      // Single retry after a short delay (Chrome sometimes rejects start if TTS just ended).
      window.setTimeout(() => {
        if (listenGenerationRef.current !== generation || !keepListeningRef.current) return;
        try {
          recognition.start();
        } catch {
          keepListeningRef.current = false;
          recognitionRef.current = null;
          setPhase("idle");
          setMediaMessage("Voice input could not be started. Press “Answer by voice” or type your answer.");
        }
      }, 280);
    }
  }, [media.microphone]);

  const speakQuestion = useCallback(
    (text: string, after?: () => void) => {
      stopRecognition({ keepPhase: true });
      setPhase("asking");
      setInterim("");
      setLiveMetrics(null);
      if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
        setMediaMessage("Text-to-speech is not available. Read the question and answer below.");
        after?.();
        return;
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setPhase("asking");
      utterance.onend = () => {
        after?.();
      };
      utterance.onerror = () => {
        after?.();
      };
      // Chrome sometimes needs getVoices() warmed before first speak.
      void window.speechSynthesis.getVoices();
      window.speechSynthesis.speak(utterance);
      setMediaMessage("Asking the question… listening will start when the interviewer finishes.");
    },
    [stopRecognition],
  );

  const speakLine = useCallback((text: string, after?: () => void) => {
    const line = String(text || "").trim();
    if (!line || typeof window === "undefined" || !("speechSynthesis" in window)) {
      after?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 1.02;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      after?.();
    };
    utterance.onend = done;
    utterance.onerror = done;
    void window.speechSynthesis.getVoices();
    window.speechSynthesis.speak(utterance);
    // Safety net if onend never fires (some Chrome builds).
    window.setTimeout(done, Math.min(20000, 1800 + line.length * 55));
  }, []);

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
    if (advancingRef.current) return;
    advancingRef.current = true;
    keepListeningRef.current = false;
    stopRecognition({ keepPhase: true });
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setGazeCoach(null);
    try {
      const next = nextActiveIndex(activeIndexRef.current, questionsRef.current.length);
      if (next === null) {
        setLastFeedback(null);
        setPhase("complete");
        setMediaMessage("All questions answered. Building your debrief report…");
        await completeSession();
        return;
      }
      // Keep lastFeedback visible only briefly; clear when next question loads via effect.
      setLastFeedback(null);
      setPhase("between");
      setActiveIndex(next);
    } finally {
      // Allow the next turn to advance after React commits the new index.
      window.setTimeout(() => {
        advancingRef.current = false;
      }, 400);
    }
  }, [completeSession, stopRecognition]);

  /** Listen only for short "proceed / next / yes" commands between questions. */
  const startProceedListening = useCallback(() => {
    if (!media.microphone) {
      setMediaMessage("Microphone is off — press Continue when you are ready.");
      return;
    }
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setMediaMessage("Voice commands unavailable — press Continue for the next question.");
      return;
    }

    keepListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const generation = ++listenGenerationRef.current;
    const recognition = new Constructor();
    recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    keepListeningRef.current = true;

    recognition.onresult = (event) => {
      if (listenGenerationRef.current !== generation) return;
      const { finalChunk, interimText } = extractSpeechTranscript(
        event.results,
        typeof event.resultIndex === "number" ? event.resultIndex : 0,
      );
      const heard = `${finalChunk} ${interimText}`.trim();
      if (!heard) return;
      if (isHoldIntent(heard)) {
        setMediaMessage("Okay — take a moment. Press Continue or say proceed when ready.");
        return;
      }
      if (isProceedIntent(heard)) {
        keepListeningRef.current = false;
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
        setMediaMessage("Proceeding…");
        void advanceAfterFeedback();
      }
    };

    recognition.onerror = () => {
      /* ignore — user can still click Continue */
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (listenGenerationRef.current !== generation) return;
      // One restart while still awaiting proceed (Chrome often ends non-continuous quickly).
      if (keepListeningRef.current && phaseRef.current === "awaiting_proceed") {
        window.setTimeout(() => {
          if (
            listenGenerationRef.current !== generation ||
            !keepListeningRef.current ||
            phaseRef.current !== "awaiting_proceed"
          ) {
            return;
          }
          try {
            const again = new Constructor();
            again.lang = recognition.lang;
            again.interimResults = true;
            again.continuous = false;
            again.onresult = recognition.onresult;
            again.onerror = recognition.onerror;
            again.onend = recognition.onend;
            recognitionRef.current = again;
            again.start();
          } catch {
            keepListeningRef.current = false;
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;
    setPhase("awaiting_proceed");
    setMediaMessage("Listening for “proceed” / “next” / “yes”… or press Continue.");
    try {
      recognition.start();
    } catch {
      window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          keepListeningRef.current = false;
          setMediaMessage("Press Continue when you are ready for the next question.");
        }
      }, 250);
    }
  }, [advanceAfterFeedback, media.microphone]);

  const runPostAnswerFlow = useCallback(
    (evaluation: AnswerEvaluation | null) => {
      const next = nextActiveIndex(activeIndexRef.current, questionsRef.current.length);
      const isLast = next === null;
      const autoContinue = autoVoiceRef.current;
      const shortLine = buildShortInterviewerLine(evaluation || {});
      const bridge = buildProceedPrompt({ isLastQuestion: isLast, autoContinue });

      setPhase("feedback");
      setMessage(shortLine);
      setMediaMessage(
        autoContinue
          ? isLast
            ? "Wrapping up after short feedback…"
            : "Short feedback — continuing automatically…"
          : "Short feedback — then say proceed or press Continue.",
      );

      speakLine(shortLine, () => {
        if (phaseRef.current !== "feedback" && phaseRef.current !== "awaiting_proceed") {
          // User navigated away mid-flow.
          return;
        }
        speakLine(bridge, () => {
          if (autoContinue) {
            setPhase(phaseAfterFeedbackSpoken(true));
            window.setTimeout(() => {
              void advanceAfterFeedback();
            }, DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS);
            return;
          }
          // Hands-on path: wait for voice "proceed" or button.
          setPhase("awaiting_proceed");
          window.setTimeout(() => {
            if (phaseRef.current === "awaiting_proceed") startProceedListening();
          }, DEFAULT_LISTEN_AFTER_TTS_MS);
        });
      });
    },
    [advanceAfterFeedback, speakLine, startProceedListening],
  );

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
      const elapsedMs =
        listenStartedAtRef.current > 0 ? Date.now() - listenStartedAtRef.current : 0;
      const speech = analyzeLiveSpeaking(text, elapsedMs);
      setLiveMetrics(speech);
      const detectorKind = gazeDetectorRef.current ? "face_detector" : "unavailable";
      const gaze = summarizeGazeSamples(gazeSamplesRef.current, {
        sampleIntervalMs: 400,
        detector: detectorKind,
      });
      setGazeSummary(gaze);
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
            duration_seconds: Math.max(0, Math.round(speech.duration_seconds)),
            speech_metrics: {
              duration_seconds: speech.duration_seconds,
              words_per_minute: speech.words_per_minute,
              pace_band: speech.pace_band,
              filler_count: speech.filler_count,
              filler_rate: speech.filler_rate,
              word_count: speech.word_count,
            },
            gaze_metrics: {
              sample_count: gaze.sample_count,
              looking_samples: gaze.looking_samples,
              away_samples: gaze.away_samples,
              no_face_samples: gaze.no_face_samples,
              looking_ratio: gaze.looking_ratio,
              looking_seconds: gaze.looking_seconds,
              away_seconds: gaze.away_seconds,
              eye_contact_score: gaze.eye_contact_score,
              band: gaze.band,
              notes: gaze.notes,
              detector: gaze.detector,
            },
          }),
        });
        const evaluation = result.evaluation || null;
        setLastFeedback(evaluation);
        setLastAnswerSnapshot(text);
        // Natural interview cadence: short coach line → auto-next or "proceed".
        runPostAnswerFlow(evaluation);
      } catch (e) {
        setError((e as Error).message);
        setPhase("idle");
      } finally {
        setSaving(false);
        submittingRef.current = false;
      }
    },
    [runPostAnswerFlow, sessionId, stopRecognition],
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

  // Camera preview only — do NOT open getUserMedia audio.
  // Holding the mic via MediaStream blocks Chrome SpeechRecognition for answers.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const flags = sessionMediaFlags(session);
    if (!flags.camera) {
      setMediaMessage(mediaReadyMessage(false, flags.microphone));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaMessage("This browser does not support camera access. Voice/typing still work.");
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setMediaMessage(mediaReadyMessage(true, flags.microphone));
      })
      .catch(() => {
        if (!cancelled) {
          setMediaMessage(
            "Camera permission was not granted. You can still use voice or type answers.",
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

  // Camera gaze sampling while the candidate is answering (FaceDetector when available).
  useEffect(() => {
    if (!media.camera || phase !== "listening") return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let detector = gazeDetectorRef.current;
    if (!detector) {
      detector = createFaceDetector();
      gazeDetectorRef.current = detector;
      setGazeSupported(Boolean(detector));
    }
    if (!detector) {
      setGazeCoach(null);
      setGazeSummary(
        summarizeGazeSamples([], { detector: "unavailable", sampleIntervalMs: 400 }),
      );
      return;
    }

    const sample = async () => {
      if (cancelled || phaseRef.current !== "listening") return;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (width < 16 || height < 16) return;
      try {
        const faces = await detector!.detect(video);
        if (cancelled) return;
        const box = faces[0]?.boundingBox;
        const classified = classifyFaceLooking(
          box
            ? { x: box.x, y: box.y, width: box.width, height: box.height }
            : null,
          width,
          height,
        );
        const entry: GazeSample = {
          at: Date.now(),
          state: classified.state,
          center_score: classified.center_score,
        };
        gazeSamplesRef.current = [...gazeSamplesRef.current, entry].slice(-600);
        recentGazeStatesRef.current = [...recentGazeStatesRef.current, entry.state].slice(-12);
        setGazeCoach(liveGazeCoachMessage(recentGazeStatesRef.current));
        setGazeSummary(
          summarizeGazeSamples(gazeSamplesRef.current, {
            sampleIntervalMs: 400,
            detector: "face_detector",
          }),
        );
      } catch {
        // Detector can fail on a single frame; do not invent a looking state.
      }
    };

    void sample();
    const id = window.setInterval(() => {
      void sample();
    }, 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [media.camera, phase, current?.id]);

  // Auto ask → listen loop when the active question changes (skip while feedback is open)
  useEffect(() => {
    if (loading || !current?.question || session?.status === "completed") return;
    if (phaseRef.current === "feedback" || phaseRef.current === "saving") return;
    let cancelled = false;
    let listenTimer = 0;
    setAnswer("");
    answerRef.current = "";
    setInterim("");
    setLiveMetrics(null);
    setGazeSummary(null);
    setGazeCoach(null);
    gazeSamplesRef.current = [];
    recentGazeStatesRef.current = [];
    setMessage("");
    setLastFeedback(null);
    setLastAnswerSnapshot("");
    listenStartedAtRef.current = 0;

    const afterSpoken = () => {
      if (cancelled) return;
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoiceRef.current);
      if (nextPhase === "listening") {
        // Wait until TTS fully releases audio, then open SpeechRecognition.
        listenTimer = scheduleListenAfterQuestionSpoken(
          () => {
            if (!cancelled) startListening();
          },
          { isCancelled: () => cancelled },
        );
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
      if (listenTimer) window.clearTimeout(listenTimer);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      stopRecognition({ keepPhase: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on question change
  }, [current?.id, loading, session?.status]);

  // Silence → auto-save; also refresh live pace/filler metrics while listening.
  useEffect(() => {
    if (phase !== "listening") return;
    const id = window.setInterval(() => {
      const msSince = Date.now() - lastSpeechAtRef.current;
      const elapsed = Date.now() - (listenStartedAtRef.current || Date.now());
      const display = interim
        ? answerRef.current
          ? `${answerRef.current} ${interim}`
          : interim
        : answerRef.current;
      setLiveMetrics(analyzeLiveSpeaking(display, elapsed));
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
  }, [phase, interim, submitCurrentAnswer]);

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
            ? "Short interviewer feedback"
            : phase === "awaiting_proceed"
              ? "Say proceed for the next question"
              : phase === "between"
                ? "Moving on…"
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
            <div style={{ position: "relative" }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: 220,
                  maxWidth: "100%",
                  borderRadius: 12,
                  background: "#0b1930",
                  transform: "scaleX(-1)",
                  border: gazeCoach
                    ? "2px solid var(--warning, #b45309)"
                    : "2px solid color-mix(in srgb, var(--success, #15803d) 55%, transparent)",
                }}
              />
              {gazeCoach ? (
                <p
                  role="status"
                  style={{
                    position: "absolute",
                    left: 8,
                    right: 8,
                    bottom: 8,
                    margin: 0,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "rgba(15, 23, 42, 0.82)",
                    color: "#fff",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {gazeCoach}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <label className="cluster" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={autoVoice}
            onChange={(e) => setAutoVoice(e.target.checked)}
            disabled={!media.microphone}
          />
          Hands-free interview (question → your answer → short feedback → next question automatically)
        </label>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          {autoVoice
            ? "After each answer you’ll hear a short coach note, then the next question starts on its own."
            : "After each answer you’ll hear a short coach note, then “Shall we move on?” — say proceed / yes / next, or press Continue."}
        </p>
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
                  ? "Listening for more… pause ~3s when finished to auto-save."
                  : "Listening… start speaking. Your words will show above."}
            </p>
          ) : null}
          {phase === "listening" && liveMetrics ? (
            <div className="panel-blue" style={{ padding: 14, borderRadius: 12 }} aria-live="polite">
              <strong>Live speaking coach</strong>
              <div className="dashboard-metrics" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 10 }}>
                <article className="metric-card">
                  <p className="metric-card-label">Pace</p>
                  <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                    {liveMetrics.words_per_minute != null ? `${liveMetrics.words_per_minute}` : "—"}
                  </div>
                  <p className="metric-card-note">{liveMetrics.pace_band}</p>
                </article>
                <article className="metric-card">
                  <p className="metric-card-label">Fillers</p>
                  <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                    {liveMetrics.filler_count}
                  </div>
                  <p className="metric-card-note">
                    {liveMetrics.filler_unique.length ? liveMetrics.filler_unique.join(", ") : "none yet"}
                  </p>
                </article>
                <article className="metric-card">
                  <p className="metric-card-label">Words</p>
                  <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                    {liveMetrics.word_count}
                  </div>
                  <p className="metric-card-note">{liveMetrics.duration_seconds}s</p>
                </article>
              </div>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: "var(--text-sm)" }}>
                {liveMetrics.pace_notes} {liveMetrics.filler_notes}
              </p>
            </div>
          ) : null}
          {phase === "listening" && media.camera ? (
            <div
              className="panel-blue"
              style={{
                padding: 14,
                borderRadius: 12,
                border: gazeCoach ? "1px solid var(--warning, #b45309)" : undefined,
              }}
              aria-live="polite"
            >
              <strong>Camera presence</strong>
              {!gazeSupported ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                  Gaze coaching needs Chrome/Edge FaceDetector. Your spoken answers are still scored.
                </p>
              ) : (
                <>
                  <div
                    className="dashboard-metrics"
                    style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 10 }}
                  >
                    <article className="metric-card">
                      <p className="metric-card-label">Eye contact</p>
                      <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                        {gazeSummary?.eye_contact_score != null ? `${gazeSummary.eye_contact_score}%` : "—"}
                      </div>
                      <p className="metric-card-note">{gazeSummary?.band || "measuring"}</p>
                    </article>
                    <article className="metric-card">
                      <p className="metric-card-label">Looking</p>
                      <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                        {gazeSummary?.looking_seconds ?? 0}s
                      </div>
                      <p className="metric-card-note">at camera</p>
                    </article>
                    <article className="metric-card">
                      <p className="metric-card-label">Looking away</p>
                      <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                        {gazeSummary?.away_seconds ?? 0}s
                      </div>
                      <p className="metric-card-note">avoid this</p>
                    </article>
                  </div>
                  {gazeCoach ? (
                    <p style={{ margin: "10px 0 0", fontWeight: 600, color: "var(--warning, #b45309)" }}>
                      {gazeCoach}
                    </p>
                  ) : (
                    <p className="muted" style={{ margin: "10px 0 0", fontSize: "var(--text-sm)" }}>
                      {gazeSummary?.notes || "Keep your face centered and look into the camera."}
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}
          <div className="cluster">
            <Button
              disabled={
                saving ||
                !answer.trim() ||
                phase === "asking" ||
                phase === "feedback" ||
                phase === "awaiting_proceed" ||
                phase === "between"
              }
              onClick={() => void submitCurrentAnswer()}
            >
              {saving ? "Evaluating…" : "Submit answer"}
            </Button>
            <Button
              variant="secondary"
              disabled={
                activeIndex <= 0 ||
                phase === "saving" ||
                phase === "asking" ||
                phase === "feedback" ||
                phase === "awaiting_proceed" ||
                phase === "between"
              }
              onClick={() => {
                stopRecognition();
                setActiveIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={saving || deleting || phase === "feedback" || phase === "between"}
              onClick={() => void completeSession()}
            >
              Complete session
            </Button>
            <Button variant="destructive" disabled={saving || deleting} onClick={() => void deleteThisSession()}>
              {deleting ? "Deleting…" : "Delete session"}
            </Button>
          </div>
        </Card>
      )}
      {(phase === "feedback" || phase === "awaiting_proceed" || phase === "between") && lastFeedback ? (
        <Card className="stack">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Interviewer (live)</h2>
            <span
              className="status-chip"
              data-tone={
                (lastFeedback.score ?? 0) >= 70 ? "success" : (lastFeedback.score ?? 0) >= 45 ? "info" : "warning"
              }
            >
              {(lastFeedback.verdict || "reviewed").replaceAll("_", " ")}
              {lastFeedback.score != null ? ` · ${lastFeedback.score}/100` : ""}
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--ink)", fontWeight: 600, fontSize: "1.05rem" }}>
            {buildShortInterviewerLine(lastFeedback)}
          </p>
          {lastAnswerSnapshot ? (
            <details>
              <summary className="muted" style={{ cursor: "pointer" }}>
                Your answer (expand)
              </summary>
              <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: "var(--ink)" }}>
                {lastAnswerSnapshot}
              </p>
            </details>
          ) : null}
          {lastFeedback.improvements && lastFeedback.improvements.length > 0 ? (
            <p style={{ margin: 0 }}>
              <strong>Coach tip: </strong>
              {lastFeedback.improvements[0]}
            </p>
          ) : null}
          {lastFeedback.filler_analysis || lastFeedback.speaking_delivery || lastFeedback.gaze_metrics ? (
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Fillers: {lastFeedback.filler_analysis?.total_count ?? lastFeedback.speaking_delivery?.filler_count ?? 0}
              {lastFeedback.speaking_delivery?.words_per_minute != null
                ? ` · Pace ~${lastFeedback.speaking_delivery.words_per_minute} wpm`
                : ""}
              {lastFeedback.gaze_metrics?.eye_contact_score != null
                ? ` · Eye contact ~${lastFeedback.gaze_metrics.eye_contact_score}%`
                : ""}
            </p>
          ) : null}
          <div className="cluster" style={{ alignItems: "center" }}>
            {phase === "awaiting_proceed" ? (
              <>
                <Button onClick={() => void advanceAfterFeedback()} disabled={saving}>
                  {activeIndex >= questions.length - 1 ? "Proceed to debrief" : "Continue — next question"}
                </Button>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  Or say <strong>proceed</strong>, <strong>yes</strong>, or <strong>next</strong>
                </p>
              </>
            ) : phase === "feedback" ? (
              <p className="muted" style={{ margin: 0 }} role="status">
                {autoVoice
                  ? "Listening to short feedback — next question starts automatically…"
                  : "Listening to short feedback — then you’ll be asked to proceed…"}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }} role="status">
                Moving on…
              </p>
            )}
            {phase === "feedback" || phase === "between" ? (
              <Button variant="secondary" onClick={() => void advanceAfterFeedback()} disabled={saving}>
                Skip ahead
              </Button>
            ) : null}
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
  const communication = body?.communication_score ?? reportRow?.communication_score;
  const structure = body?.structure_score ?? reportRow?.structure_score;
  const content = body?.content_score ?? reportRow?.content_score;
  const reviews = body?.question_reviews || [];
  const readiness = body?.practice_readiness;
  const speaking = body?.speaking_summary;
  const gaze = body?.gaze_summary;
  const series = body?.score_series?.length
    ? body.score_series
    : reviews.map((r, i) => ({
        position: i + 1,
        score: r.score ?? 0,
        label: `Q${i + 1}`,
      }));
  const maxBar = 100;
  const reportProvider = body?.provider || reportRow?.provider || "unknown";
  const generationStatus = body?.generation_status || reportRow?.generation_status;
  const aiGenerated = generationStatus === "ai_generated" || reportProvider === "groq";

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
        description="Evidence-based practice debrief: scores, speech pace, fillers, and readiness coaching — stored for this session. Not an employer hiring decision."
        action={
          <Link className="button button-secondary" href="/mock-interview">
            All sessions
          </Link>
        }
      />

      <Card className="report-provenance" role="status">
        <strong>{aiGenerated ? "AI coach report" : "Evidence-only report"}</strong>
        <p style={{ margin: "6px 0 0" }}>
          {aiGenerated
            ? "The narrative was generated from this session's recorded questions, answers, and measured delivery signals."
            : "No AI narrative is being claimed here. Scores and coaching are derived only from the recorded answers and measured metrics."}
        </p>
      </Card>

      {readiness ? (
        <Card className="stack">
          <div className="cluster" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0 }}>Practice readiness</h2>
              <p style={{ margin: "8px 0 0", fontWeight: 600 }}>{readiness.label}</p>
              <p style={{ margin: "6px 0 0" }}>{readiness.next_step}</p>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: "var(--text-sm)" }}>
                {readiness.disclaimer}
              </p>
            </div>
            <ScoreRing score={readiness.composite_score ?? overall} label="Readiness" size={120} />
          </div>
        </Card>
      ) : null}

      <div className="interview-progress-grid">
        <div className="interview-progress-chart-col stack" style={{ gap: 16 }}>
          <Card className="stack">
            <h2 style={{ margin: 0 }}>Dimension scores</h2>
            {(
              [
                ["Overall", overall],
                ["Communication", communication],
                ["Structure", structure],
                ["Content", content],
              ] as const
            ).map(([label, value]) => {
              const safe = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
              return (
                <div key={label}>
                  <div className="cluster" style={{ justifyContent: "space-between" }}>
                    <span>{label}</span>
                    <strong>{value ?? "—"}</strong>
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "var(--surface-muted, #e8eef7)",
                      overflow: "hidden",
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        width: `${safe}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "var(--primary-strong, #1d4ed8)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>

          {series.length > 0 ? (
            <Card className="stack">
              <h2 style={{ margin: 0 }}>Score by question</h2>
              <div
                className="cluster"
                style={{ alignItems: "flex-end", gap: 10, minHeight: 140, paddingTop: 8 }}
                role="img"
                aria-label="Per-question scores"
              >
                {series.map((point, index) => {
                  const score = Math.max(0, Math.min(maxBar, Number(point.score) || 0));
                  const height = Math.max(8, (score / maxBar) * 120);
                  return (
                    <div key={`${point.label || index}`} style={{ flex: 1, textAlign: "center" }}>
                      <div
                        title={`${point.label || `Q${index + 1}`}: ${score}/100`}
                        style={{
                          height,
                          borderRadius: "8px 8px 4px 4px",
                          background:
                            score >= 70
                              ? "var(--success, #15803d)"
                              : score >= 45
                                ? "var(--primary-strong, #1d4ed8)"
                                : "var(--warning, #b45309)",
                          margin: "0 auto",
                          maxWidth: 48,
                        }}
                      />
                      <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                        {point.label || `Q${point.position || index + 1}`}
                      </p>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-sm)" }}>{score}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="interview-progress-side stack" style={{ gap: 16 }}>
          <div className="dashboard-metrics" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <article className="metric-card">
              <p className="metric-card-label">Overall</p>
              <div className="metric-value">{overall ?? "—"}</div>
            </article>
            <article className="metric-card">
              <p className="metric-card-label">Communication</p>
              <div className="metric-value">{communication ?? "—"}</div>
            </article>
            <article className="metric-card">
              <p className="metric-card-label">Structure</p>
              <div className="metric-value">{structure ?? "—"}</div>
            </article>
            <article className="metric-card">
              <p className="metric-card-label">Content</p>
              <div className="metric-value">{content ?? "—"}</div>
            </article>
          </div>
          {speaking ? (
            <Card className="stack">
              <h2 style={{ margin: 0 }}>Speaking delivery</h2>
              <p style={{ margin: 0 }}>
                Avg pace:{" "}
                <strong>
                  {speaking.average_words_per_minute != null
                    ? `${speaking.average_words_per_minute} wpm`
                    : "not timed"}
                </strong>
              </p>
              <p style={{ margin: 0 }}>
                Fillers: <strong>{speaking.total_fillers ?? 0}</strong> across ~{speaking.total_words ?? 0}{" "}
                words
                {speaking.filler_rate != null ? ` (${Math.round(speaking.filler_rate * 1000) / 10}%)` : ""}
              </p>
            </Card>
          ) : null}
          {gaze ? (
            <Card className="stack">
              <h2 style={{ margin: 0 }}>Camera presence</h2>
              <div className="cluster" style={{ alignItems: "center", gap: 16 }}>
                <ScoreRing score={gaze.average_eye_contact_score} label="Eye contact" size={100} />
                <div>
                  <p style={{ margin: 0 }}>
                    Looking at camera samples: <strong>{gaze.looking_samples ?? 0}</strong>
                  </p>
                  <p style={{ margin: "4px 0 0" }}>
                    Looking away samples: <strong>{gaze.away_samples ?? 0}</strong>
                  </p>
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: "var(--text-sm)" }}>
                    {gaze.notes}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
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
