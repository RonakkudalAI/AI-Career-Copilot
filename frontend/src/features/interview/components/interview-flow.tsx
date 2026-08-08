
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";

import { apiRequest, isAbortError } from "@/shared/api/client";
import { Button, Card, PageHeader, Textarea } from "@/shared/ui/primitives";
import { useTheme } from "@/shared/theme";
import {
  DEFAULT_ANSWER_SILENCE_MS,
  DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS,
  DEFAULT_LISTEN_AFTER_TTS_MS,
  DEFAULT_TTS_MAX_WAIT_MS,
  analyzeLiveSpeaking,
  buildProceedPrompt,
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
  type SpeechResultListLike,
} from "@/features/interview/interview-voice";
import {
  cancelInterviewSpeech,
  fetchInterviewTtsStatus,
  isInterviewSpeechBusy,
  speakInterviewLine,
} from "@/features/interview/interview-tts";
import {
  createFaceDetector,
  liveGazeCoachMessage,
  sampleCameraPresence,
  summarizeGazeSamples,
  type FaceDetectorLike,
  type GazeDetectorKind,
  type GazeSample,
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

function buildConversationalCoachLine(evaluation: AnswerEvaluation | null): string {
  const feedback = String(evaluation?.interviewer_feedback || "").trim();
  const improvement = (evaluation?.improvements || []).map(String).find((item) => item.trim())?.trim();
  const strongerApproach = String(evaluation?.better_approach || "").trim();
  const strength = (evaluation?.strengths || []).map(String).find((item) => item.trim())?.trim();

  if (feedback) return feedback.slice(0, 300);
  if (improvement) return `That answer needs one adjustment: ${improvement}`.slice(0, 300);
  if (strongerApproach) return `A stronger way to answer would be: ${strongerApproach}`.slice(0, 300);
  if (strength) return `That was a clear point: ${strength}`.slice(0, 300);
  return "Thanks, I’ve noted that answer. Let’s continue with the next question.";
}

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
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  maxAlternatives?: number;
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
              Prepare interview
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
          <p>Prepare with your confirmed resume and job description, then start your first practice session.</p>
          <div className="cluster">
            <Link className="button button-primary" href="/mock-interview/preparation">
              Prepare an interview
            </Link>
            <Link className="button button-secondary" href="/mock-interview/setup">
              Start without preparation
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

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

export function InterviewSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedResumeVersionId = searchParams.get("resume_version_id") || "";
  const jobDescriptionId = searchParams.get("job_description_id") || "";
  const [mode, setMode] = useState(
    linkedResumeVersionId && jobDescriptionId ? "resume_and_jd" : "mixed",
  );
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
  const [busy, setBusy] = useState(false);

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
            list.find((row) => row.latest_version?.id)?.latest_version?.id ||
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

  const needsResume = mode === "resume" || mode === "resume_and_jd";
  const resumesWithVersion = storedResumes.filter((row) => row.latest_version?.id);

  async function create() {
    if (needsResume && !resumeVersionId) {
      setError("Choose a saved resume, or open Resume Analysis to upload one first.");
      return;
    }
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
          target_company: null,
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
    <div className="feature-page">
      <PageHeader
        eyebrow="Interview setup"
        title="Start a focused practice session"
        description="Choose your resume and role. Everything else is optional, and the interviewer uses only the context you provide."
      />
      <Card className="stack interview-setup-card">
        {linkedResumeVersionId && jobDescriptionId ? (
          <p role="status" className="muted" style={{ margin: 0 }}>
            Linked to confirmed resume and job description from preparation. You can still paste extra JD text below.
          </p>
        ) : null}
        <label className="field-label">
          Resume context <span className="field-hint">optional, but recommended</span>
          {resumesLoading ? (
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Loading saved resumes…
            </p>
          ) : resumesWithVersion.length ? (
            <select
              className="field"
              value={resumeVersionId}
              onChange={(e) => setResumeVersionId(e.target.value)}
            >
              {!needsResume ? <option value="">None — general practice</option> : null}
              {resumesWithVersion.map((row) => (
                <option key={row.latest_version!.id} value={row.latest_version!.id}>
                  {row.title}
                  {row.is_active ? " (active)" : ""}
                  {row.latest_version?.original_filename
                    ? ` · ${row.latest_version.original_filename}`
                    : ""}
                  {row.latest_version?.extraction_status
                    ? ` · ${row.latest_version.extraction_status}`
                    : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted" style={{ margin: "8px 0 0" }}>
              No saved resume yet.{" "}
              <Link href="/settings/profile">Complete your profile</Link> or{" "}
              <Link href="/resume-analysis?tab=upload">upload one</Link> — it will appear here for reuse.
            </p>
          )}
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
        <details className="interview-setup-advanced">
          <summary>Optional context and session preferences</summary>
          <div className="stack" style={{ gap: 16, paddingTop: 16 }}>
        <label className="field-label">
          Paste a job description <span className="field-hint">optional</span>
          <Textarea
            value={jobDescriptionText}
            onChange={(e: { target: { value: string } }) => setJobDescriptionText(e.target.value)}
            placeholder="Paste the JD text here. Questions will only use requirements written in this text — nothing invented."
          />
        </label>
            <label className="field-label">
              Interview focus
              <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="mixed">Balanced practice</option>
                <option value="behavioural">Behavioural</option>
                <option value="technical">Technical</option>
                <option value="hr">HR / screening</option>
                <option value="role">Role-focused</option>
                <option value="resume">Resume-based</option>
                <option value="resume_and_jd">Resume + job description</option>
              </select>
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
            Camera presence coaching is on by default and is not recorded. Speech recognition uses the browser microphone separately from the camera.
          </p>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={cameraEnabled} onChange={(e) => setCameraEnabled(e.target.checked)} />
            Use camera presence coaching
          </label>
          <label className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={microphoneEnabled} onChange={(e) => setMicrophoneEnabled(e.target.checked)} />
            Use voice answers
          </label>
        </div>
          </div>
        </details>
        <div className="interview-setup-note">
          <strong>What happens next</strong>
          <span>The agent asks one question, waits for your complete answer, evaluates it, and then gives the next prompt.</span>
        </div>
        {error && <p className="field-error">{error}</p>}
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? "Creating session…" : "Create session & start"}
        </Button>
      </Card>
    </div>
  );
}

export function InterviewSession() {
  const { resolvedTheme } = useTheme();
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
  const [gazeCoach, setGazeCoach] = useState<string | null>(null);
  const [gazeSupported, setGazeSupported] = useState(true);
  const [, setGazeDetectorKind] = useState<GazeDetectorKind>("unavailable");
  const [, setTtsProviderLabel] = useState("browser");

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
  const gazeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recentGazeStatesRef = useRef<GazeSample["state"][]>([]);
  const gazeAwaySinceRef = useRef<number | null>(null);
  const gazeStopTriggeredRef = useRef(false);
  const gazeDetectorKindRef = useRef<GazeDetectorKind>("unavailable");
  /** Abort controller for the in-flight interviewer TTS turn. */
  const ttsAbortRef = useRef<AbortController | null>(null);
  /** Monotonic id so stale speak callbacks cannot steal the turn. */
  const speakGenerationRef = useRef(0);

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

  const abortInterviewerSpeech = useCallback(() => {
    speakGenerationRef.current += 1;
    try {
      ttsAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
    ttsAbortRef.current = null;
    cancelInterviewSpeech();
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

    // Never capture interviewer audio — only open the mic after TTS is idle.
    // Do NOT cancel mid-sentence here; caller waits until speech finishes first.
    if (isInterviewSpeechBusy()) {
      setMediaMessage("Wait for the interviewer to finish speaking…");
      return;
    }
    cancelInterviewSpeech();

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
    recognition.maxAlternatives = 1;
    lastSpeechAtRef.current = Date.now();
    listenStartedAtRef.current = Date.now();
    keepListeningRef.current = true;

    const bindHandlers = (instance: SpeechRecognitionLike) => {
      instance.onstart = () => {
        if (listenGenerationRef.current !== generation) return;
        setPhase("listening");
        setMediaMessage("Listening… speak your answer. Your words will appear as you talk.");
      };
      instance.onaudiostart = () => {
        if (listenGenerationRef.current === generation) {
          setMediaMessage("Microphone is active. Speak your answer now.");
        }
      };
      instance.onspeechstart = () => {
        if (listenGenerationRef.current === generation) {
          setMediaMessage("Hearing you… keep speaking until your answer is complete.");
        }
      };
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
          return merged.committed;
        });
        setInterim(interimText);
        setMediaMessage("Listening… your words appear in the answer box as you speak.");
      };

      instance.onerror = (event) => {
        if (listenGenerationRef.current !== generation) return;
        const code = String(event?.error || "");
        // "no-speech" / "aborted" are normal; onend will restart while the
        // turn is active. Keep the user informed instead of failing silently.
        if (code === "no-speech") {
          setMediaMessage("I did not hear speech yet. Keep speaking, or type your answer.");
          return;
        }
        if (code === "aborted") return;
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
              again.maxAlternatives = 1;
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
    setMediaMessage("Listening… speak your answer. It will appear below.");
    try {
      recognition.start();
    } catch {
      // Single retry after a short delay (Chrome sometimes rejects start if TTS just ended).
      window.setTimeout(() => {
        if (listenGenerationRef.current !== generation || !keepListeningRef.current) return;
        try {
          try {
            recognition.abort?.();
          } catch {
            /* ignore a failed first start */
          }
          const retry = new Constructor();
          retry.lang = recognition.lang;
          retry.interimResults = true;
          retry.continuous = true;
          retry.maxAlternatives = 1;
          bindHandlers(retry);
          recognitionRef.current = retry;
          retry.start();
        } catch {
          keepListeningRef.current = false;
          recognitionRef.current = null;
          setPhase("idle");
          setMediaMessage("Voice input could not be started. Press “Answer by voice” or type your answer.");
        }
      }, 280);
    }
  }, [media.microphone]);

  /**
   * Speak a full interviewer line via Fish Audio (or browser fallback).
   * Resolves only after the entire sentence finishes — never mid-utterance.
   */
  const speakInterviewer = useCallback(
    async (
      text: string,
      options?: { kind?: "question" | "feedback" | "bridge" | "general"; onDone?: () => void },
    ) => {
      const line = String(text || "").trim();
      stopRecognition({ keepPhase: true });
      if (!line) {
        options?.onDone?.();
        return;
      }

      // Cancel any previous interviewer turn before starting a new one.
      try {
        ttsAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      const generation = ++speakGenerationRef.current;

      setPhase(options?.kind === "feedback" || options?.kind === "bridge" ? "feedback" : "asking");
      setInterim("");
      setMediaMessage(
        options?.kind === "feedback" || options?.kind === "bridge"
          ? "Interviewer speaking… please wait until they finish."
          : "Asking the question… listening starts only after the full question is spoken.",
      );

      try {
        await speakInterviewLine(line, {
          kind: options?.kind ?? "general",
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // speakInterviewLine already falls back to browser TTS; still continue the flow.
      }

      if (speakGenerationRef.current !== generation || controller.signal.aborted) return;
      options?.onDone?.();
    },
    [stopRecognition],
  );

  const speakQuestion = useCallback(
    (text: string, after?: () => void) => {
      void speakInterviewer(text, { kind: "question", onDone: after });
    },
    [speakInterviewer],
  );

  const speakLine = useCallback(
    (text: string, after?: () => void, kind: "feedback" | "bridge" | "general" = "feedback") => {
      void speakInterviewer(text, { kind, onDone: after });
    },
    [speakInterviewer],
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
    if (advancingRef.current) return;
    advancingRef.current = true;
    keepListeningRef.current = false;
    stopRecognition({ keepPhase: true });
    abortInterviewerSpeech();
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
  }, [abortInterviewerSpeech, completeSession, stopRecognition]);

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
      const shortLine = buildConversationalCoachLine(evaluation);
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

      // Speak full feedback, then full bridge — never advance while still talking.
      speakLine(
        shortLine,
        () => {
          if (phaseRef.current !== "feedback" && phaseRef.current !== "awaiting_proceed") {
            return;
          }
          speakLine(
            bridge,
            () => {
              if (autoContinue) {
                setPhase(phaseAfterFeedbackSpoken(true));
                window.setTimeout(() => {
                  void advanceAfterFeedback();
                }, DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS);
                return;
              }
              setPhase("awaiting_proceed");
              window.setTimeout(() => {
                if (phaseRef.current === "awaiting_proceed" && !isInterviewSpeechBusy()) {
                  startProceedListening();
                }
              }, DEFAULT_LISTEN_AFTER_TTS_MS);
            },
            "bridge",
          );
        },
        "feedback",
      );
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
      const detectorKind: GazeDetectorKind =
        gazeDetectorKindRef.current !== "unavailable"
          ? gazeDetectorKindRef.current
          : gazeDetectorRef.current
            ? "face_detector"
            : gazeSamplesRef.current.length > 0
              ? "canvas_presence"
              : "unavailable";
      const gaze = summarizeGazeSamples(gazeSamplesRef.current, {
        sampleIntervalMs: 400,
        detector: detectorKind,
      });
      const answerPayload = {
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
      };
      try {
        const result = await apiRequest<{
          response?: unknown;
          evaluation?: AnswerEvaluation;
          question?: Question;
          accepted?: boolean;
        }>(`/interviews/${sessionId}/responses`, {
          method: "POST",
          body: JSON.stringify(answerPayload),
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
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          void video.play().catch(() => {
            /* autoplay policies — muted should allow play */
          });
        }
        // Warm FaceDetector when present; canvas fallback still works without it.
        if (!gazeDetectorRef.current) {
          const det = createFaceDetector();
          gazeDetectorRef.current = det;
          setGazeSupported(true); // canvas fallback always available with a live camera
          const kind: GazeDetectorKind = det ? "face_detector" : "canvas_presence";
          gazeDetectorKindRef.current = kind;
          setGazeDetectorKind(kind);
        }
        setMediaMessage(
          `${mediaReadyMessage(true, flags.microphone)} Camera presence analysis is active.`,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setGazeSupported(false);
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

  // Probe Fish Audio availability once per session (no secrets; status only).
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    void fetchInterviewTtsStatus()
      .then((status) => {
        if (!active) return;
        setTtsProviderLabel(status.configured ? "Fish Audio" : "browser");
      })
      .catch(() => {
        if (active) setTtsProviderLabel("browser");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Attach stream if video element mounts later
  useEffect(() => {
    if (!media.camera || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  }, [media.camera, current?.id]);

  // Camera presence sampling while the candidate is answering.
  // FaceDetector when available; canvas skin-mass heuristic otherwise — never silent.
  useEffect(() => {
    if (!media.camera || phase !== "listening") return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    if (!gazeDetectorRef.current) {
      gazeDetectorRef.current = createFaceDetector();
    }
    if (!gazeCanvasRef.current && typeof document !== "undefined") {
      gazeCanvasRef.current = document.createElement("canvas");
    }
    setGazeSupported(true);

    const sample = async () => {
      if (cancelled || phaseRef.current !== "listening") return;
      // Keep trying until the video has real frames (common right after permission).
      if ((video.videoWidth || 0) < 16 || video.readyState < 2) {
        void video.play().catch(() => undefined);
        return;
      }
      try {
        const result = await sampleCameraPresence(video, {
          detector: gazeDetectorRef.current,
          canvas: gazeCanvasRef.current,
        });
        if (cancelled) return;
        if (result.state === "unavailable" && result.detector === "unavailable") return;

        if (result.detector !== "unavailable") {
          gazeDetectorKindRef.current = result.detector;
          setGazeDetectorKind(result.detector);
        }
        const entry: GazeSample = {
          at: Date.now(),
          state: result.state === "unavailable" ? "no_face" : result.state,
          center_score: result.center_score,
        };

        if (entry.state === "looking") {
          gazeAwaySinceRef.current = null;
        } else if (gazeAwaySinceRef.current === null) {
          gazeAwaySinceRef.current = entry.at;
        }

        if (
          gazeAwaySinceRef.current !== null &&
          entry.at - gazeAwaySinceRef.current >= 10_000 &&
          !gazeStopTriggeredRef.current
        ) {
          gazeStopTriggeredRef.current = true;
          keepListeningRef.current = false;
          stopRecognition({ keepPhase: true });
          abortInterviewerSpeech();
          setPhase("complete");
          setMediaMessage("Camera check paused the interview. Preparing your evaluation report…");
          void completeSession();
          return;
        }

        gazeSamplesRef.current = [...gazeSamplesRef.current, entry].slice(-600);
        recentGazeStatesRef.current = [...recentGazeStatesRef.current, entry.state].slice(-12);
        setGazeCoach(liveGazeCoachMessage(recentGazeStatesRef.current));
      } catch {
        // Single-frame failures are fine — keep sampling.
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
  }, [abortInterviewerSpeech, completeSession, media.camera, phase, current?.id, stopRecognition]);

  // Auto ask → listen loop when the active question changes (skip while feedback is open)
  useEffect(() => {
    if (loading || !current?.question || session?.status === "completed") return;
    if (phaseRef.current === "feedback" || phaseRef.current === "saving") return;
    let cancelled = false;
    let listenTimer = 0;
    setAnswer("");
    answerRef.current = "";
    setInterim("");
    setGazeCoach(null);
    gazeSamplesRef.current = [];
    recentGazeStatesRef.current = [];
    gazeAwaySinceRef.current = null;
    setMessage("");
    setLastFeedback(null);
    setLastAnswerSnapshot("");
    listenStartedAtRef.current = 0;

    const afterSpoken = () => {
      if (cancelled) return;
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoiceRef.current);
      if (nextPhase === "listening") {
        // Wait until the FULL question audio finishes — never cut mid-sentence.
        listenTimer = scheduleListenAfterQuestionSpoken(
          () => {
            if (!cancelled) startListening();
          },
          {
            isCancelled: () => cancelled,
            maxWaitMs: DEFAULT_TTS_MAX_WAIT_MS,
            isBusy: () => isInterviewSpeechBusy(),
          },
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
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (listenTimer) window.clearTimeout(listenTimer);
      abortInterviewerSpeech();
      stopRecognition({ keepPhase: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on question change
  }, [current?.id, loading, session?.status]);

  // Silence → auto-save; also refresh live pace/filler metrics while listening.
  useEffect(() => {
    if (phase !== "listening") return;
    const id = window.setInterval(() => {
      const msSince = Date.now() - lastSpeechAtRef.current;
      if (
        !interim.trim() &&
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
      abortInterviewerSpeech();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [abortInterviewerSpeech, stopRecognition],
  );

  function toggleVoiceAnswer() {
    if (phase === "listening" || recognitionRef.current) {
      stopRecognition();
      setMediaMessage("Listening stopped. Edit your answer or save to continue.");
      return;
    }
    if (isInterviewSpeechBusy()) {
      setMediaMessage("Wait for the interviewer to finish, then try again.");
      return;
    }
    cancelInterviewSpeech();
    startListening();
  }

  function askQuestionAloud() {
    if (!current?.question) return;
    speakQuestion(current.question, () => {
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoice);
      if (nextPhase === "listening") {
        scheduleListenAfterQuestionSpoken(
          () => startListening(),
          {
            maxWaitMs: DEFAULT_TTS_MAX_WAIT_MS,
            isBusy: () => isInterviewSpeechBusy(),
          },
        );
      } else setPhase("idle");
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
          ? "Agent is thinking and evaluating your answer…"
          : phase === "feedback"
            ? "Short interviewer feedback"
            : phase === "awaiting_proceed"
              ? "Say proceed for the next question"
              : phase === "between"
                ? "Moving on…"
                : phase === "complete"
                  ? "Session complete"
                  : "Ready";
  const auraState =
    phase === "asking" || phase === "feedback"
      ? "speaking"
      : phase === "listening"
        ? "listening"
        : phase === "saving" || phase === "between"
          ? "thinking"
          : "idle";

  return (
    <div className="feature-page interview-session-page">
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
      <div className="interview-room-layout">
        <aside className="interview-question-rail" aria-label="Interview progress">
          <div className="interview-rail-kicker">Session map</div>
          <div className="interview-rail-count">
            <strong>{questions.length ? String(activeIndex + 1).padStart(2, "0") : "--"}</strong>
            <span>/ {questions.length ? String(questions.length).padStart(2, "0") : "--"}</span>
          </div>
          <ol className="interview-question-list">
            {questions.map((question, index) => (
              <li key={question.id || index} className={index === activeIndex ? "is-current" : index < activeIndex ? "is-done" : ""}>
                <span className="interview-question-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="interview-question-kind">{question.question_type || "practice"}</span>
              </li>
            ))}
          </ol>
          <p className="interview-rail-note">One answer at a time. The agent waits for the complete thought before moving on.</p>
        </aside>
        <main className="interview-room-main">
          <div className="interview-room-statusbar">
            <span className="interview-room-live-dot" aria-hidden="true" />
            <span>{phaseLabel}</span>
            <span className="interview-room-status-separator" aria-hidden="true">/</span>
            <span>{media.camera ? "Presence check on" : "Camera off"}</span>
          </div>
      <Card className="stack interview-agent-card">
        <div className="interview-agent-header">
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ margin: 0 }}>Live practice</h2>
            <p className="muted" style={{ margin: 0 }}>
              {mediaMessage || "Questions are spoken aloud; your spoken answers appear in the box below."}
            </p>
            <p style={{ margin: 0, fontWeight: 600 }}>{phaseLabel}</p>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              Voice interview · {media.camera ? "Presence coaching is on" : "Camera is off"}
            </p>
            {!speechSupported ? (
              <p className="field-error" style={{ margin: 0 }}>
                This browser has no Web Speech recognition (try Chrome/Edge). Typing still works.
              </p>
            ) : null}
          </div>
          <div className="interview-aura-stage" aria-label={`Interviewer ${auraState}`}>
            <AgentAudioVisualizerAura
              size="md"
              color="#008cff"
              colorShift={0.26}
              state={auraState}
              themeMode={resolvedTheme}
              className="interview-agent-aura"
            />
            <span className="interview-aura-label">
              {auraState === "speaking"
                ? "Interviewer speaking"
                : auraState === "listening"
                  ? "Your turn"
                  : auraState === "thinking"
                    ? "Reviewing"
                    : "Ready"}
            </span>
          </div>
          {media.camera ? (
            <div className="interview-camera-frame">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="interview-camera-video"
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
              <span className="interview-video-label">Your camera</span>
              {gazeCoach ? (
                <p
                  role="status"
                  className="interview-gaze-coach"
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
            ? "Natural back-and-forth: the interviewer finishes each full line before listening. After your answer you get a short coach note, then the next question."
            : "After each answer you’ll hear a short coach note, then “Shall we move on?” — say proceed / yes / next, or press Continue."}
        </p>
        <div className="cluster interview-agent-actions">
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
        <Card className="stack interview-question-card">
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
                  ? "Listening for more… pause 5 seconds when finished, or submit when you are done."
                  : "Listening… start speaking. Your words will show above."}
            </p>
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
              <strong>Camera check</strong>
              {!gazeSupported ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                  Camera is not available. Your spoken answers are still scored.
                </p>
              ) : (
                <>
                  {gazeCoach ? (
                    <p style={{ margin: "10px 0 0", fontWeight: 600, color: "var(--warning, #b45309)" }}>
                      {gazeCoach}
                    </p>
                  ) : (
                    <p className="muted" style={{ margin: "10px 0 0", fontSize: "var(--text-sm)" }}>
                      {"Camera check is active. Keep your face centered while you answer."}
                    </p>
                  )}
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: "var(--text-sm)" }}>
                    Repeated off-camera or no-face samples are flagged for the debrief; the check does not infer intent.
                  </p>
                </>
              )}
            </div>
          ) : null}
          <div className="cluster interview-question-actions">
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
        <Card className="stack interview-feedback-card">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Interviewer note</h2>
          </div>
          <p style={{ margin: 0, color: "var(--ink)", fontWeight: 600, fontSize: "1.05rem" }}>
            {buildConversationalCoachLine(lastFeedback)}
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
        </main>
      </div>
    </div>
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
