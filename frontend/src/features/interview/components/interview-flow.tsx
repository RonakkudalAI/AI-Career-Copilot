
import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "@/shared/api/client";
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
        eyebrow="Practice"
        title="Interview sessions"
        description="Sessions and questions are stored in your account. Practice questions are generated when AI is available."
        action={
          <div className="cluster">
            <Link className="button button-secondary" href="/mock-interview/preparation">
              Prepare first
            </Link>
            <Link className="button button-primary" href="/mock-interview/setup">
              Create session
            </Link>
          </div>
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
            <Link className="button button-secondary" href={`/mock-interview/session/${s.id}`}>
              Open session
            </Link>
            <Button
              variant="destructive"
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
      await apiRequest(`/interviews/${sessionId}/complete`, { method: "POST" });
      setMessage("Session marked complete.");
      setSession((s) => (s ? { ...s, status: "completed" } : s));
      setPhase("complete");
      setMediaMessage("Session complete. You can review answers or delete the session.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [sessionId]);

  const submitCurrentAnswer = useCallback(
    async (opts?: { advance?: boolean }) => {
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
        await apiRequest(`/interviews/${sessionId}/responses`, {
          method: "POST",
          body: JSON.stringify({
            question_id: q.id,
            typed_response: text,
            transcript: text,
          }),
        });
        setMessage("Answer saved.");
        setAnswer("");
        answerRef.current = "";
        if (opts?.advance !== false) {
          const next = nextActiveIndex(activeIndexRef.current, questionsRef.current.length);
          if (next === null) {
            setPhase("complete");
            setMediaMessage("All questions answered. Completing the session…");
            await completeSession();
          } else {
            setPhase("between");
            setActiveIndex(next);
          }
        } else {
          setPhase("idle");
        }
      } catch (e) {
        setError((e as Error).message);
        setPhase("idle");
      } finally {
        setSaving(false);
        submittingRef.current = false;
      }
    },
    [completeSession, sessionId, stopRecognition],
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

  // Auto ask → listen loop when the active question changes
  useEffect(() => {
    if (loading || !current?.question || session?.status === "completed") return;
    let cancelled = false;
    setAnswer("");
    answerRef.current = "";
    setInterim("");
    setMessage("");

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
        void submitCurrentAnswer({ advance: true });
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
          ? "Saving answer…"
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
              disabled={saving || !answer.trim() || phase === "asking"}
              onClick={() => void submitCurrentAnswer({ advance: true })}
            >
              {saving ? "Saving…" : "Save & next"}
            </Button>
            <Button
              variant="secondary"
              disabled={activeIndex <= 0 || phase === "saving" || phase === "asking"}
              onClick={() => {
                stopRecognition();
                setActiveIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={activeIndex >= questions.length - 1 || phase === "saving" || phase === "asking"}
              onClick={() => {
                stopRecognition();
                setActiveIndex((i) => Math.min(questions.length - 1, i + 1));
              }}
            >
              Next
            </Button>
            <Button variant="secondary" disabled={saving || deleting} onClick={() => void completeSession()}>
              Complete session
            </Button>
            <Button variant="destructive" disabled={saving || deleting} onClick={() => void deleteThisSession()}>
              {deleting ? "Deleting…" : "Delete session"}
            </Button>
          </div>
        </Card>
      )}
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
