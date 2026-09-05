import { Link } from "@/shared/ui/router-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { apiRequest } from "@/shared/api/client";
import { Button, Textarea } from "@/shared/ui/primitives";
import LoadingState from "@/components/ui/loading-state";
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
  spokenInterviewerReply,
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
import type { AnswerEvaluation, Question, Session } from "@/features/interview/types";
import { liveFollowUpQuestion, spokenQuestionLine } from "@/features/interview/live-bank";
import {
  clearLiveInterview,
  isLiveSessionId,
  liveToSession,
  loadLiveInterview,
  writeLiveInterview,
} from "@/features/interview/live-store";
import { decideInterviewerTurn, maxLiveQuestionBudget } from "@/features/interview/live-turn";
import { AnswerRecorder, chooseAnswerTranscript, transcribeInterviewAudio } from "@/features/interview/interview-stt";
import "@/features/interview/interview.css";

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

function phaseCopy(phase: InterviewTurnPhase): string {
  if (phase === "asking") return "Interviewer is asking";
  if (phase === "listening") return "Your turn — speak now";
  if (phase === "saving") return "Considering that";
  if (phase === "feedback") return "A short note from the interviewer";
  if (phase === "awaiting_proceed") return "Say proceed when you are ready";
  if (phase === "between") return "Moving on";
  if (phase === "complete") return "Session complete";
  return "Ready";
}

export function InterviewSession() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = String(params?.sessionId || "");
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");
  const [phase, setPhase] = useState<InterviewTurnPhase>("idle");
  const [autoVoice, setAutoVoice] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [lastFeedback, setLastFeedback] = useState<AnswerEvaluation | null>(null);
  const [lastAnswerSnapshot, setLastAnswerSnapshot] = useState("");
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
  const listenGenerationRef = useRef(0);
  const gazeSamplesRef = useRef<GazeSample[]>([]);
  const gazeDetectorRef = useRef<FaceDetectorLike | null>(null);
  const gazeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recentGazeStatesRef = useRef<GazeSample["state"][]>([]);
  const gazeAwaySinceRef = useRef<number | null>(null);
  const gazeDetectorKindRef = useRef<GazeDetectorKind>("unavailable");
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speakGenerationRef = useRef(0);
  const recorderRef = useRef(new AnswerRecorder());

  const current = questions[activeIndex];
  const media = sessionMediaFlags(session || {});
  const liveTranscript = interim ? (answer ? `${answer} ${interim}` : interim) : answer;
  const isFollowUp = current?.question_type === "follow_up" || current?.source_context?.kind === "follow_up";

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
      setMediaMessage("Microphone is off for this session. Type your answer.");
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
    if (isInterviewSpeechBusy()) {
      setMediaMessage("Wait for the interviewer to finish speaking…");
      return;
    }
    cancelInterviewSpeech();

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
    recognition.maxAlternatives = 3;
    void recorderRef.current.start();
    lastSpeechAtRef.current = Date.now();
    listenStartedAtRef.current = Date.now();
    keepListeningRef.current = true;

    const bindHandlers = (instance: SpeechRecognitionLike) => {
      instance.onstart = () => {
        if (listenGenerationRef.current !== generation) return;
        setPhase("listening");
        setMediaMessage("Listening… your words appear as you talk.");
      };
      instance.onaudiostart = () => {
        if (listenGenerationRef.current === generation) {
          setMediaMessage("Microphone is active. Speak your answer now.");
        }
      };
      instance.onspeechstart = () => {
        if (listenGenerationRef.current === generation) {
          recorderRef.current.markSpeech();
          setMediaMessage("Hearing you… keep going until the thought is complete.");
        }
      };
      instance.onresult = (event) => {
        if (listenGenerationRef.current !== generation) return;
        lastSpeechAtRef.current = Date.now();
        recorderRef.current.markSpeech();
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
      };
      instance.onerror = (event) => {
        if (listenGenerationRef.current !== generation) return;
        const code = String(event?.error || "");
        if (code === "no-speech") {
          setMediaMessage("I did not hear speech yet. Keep speaking, or type your answer.");
          return;
        }
        if (code === "aborted") return;
        if (code === "not-allowed" || code === "service-not-allowed") {
          keepListeningRef.current = false;
          setMediaMessage("Microphone permission was denied. Enable it in the browser, or type.");
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
        if (recognitionRef.current === instance) recognitionRef.current = null;
        if (listenGenerationRef.current !== generation) return;
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
              again.maxAlternatives = 3;
              bindHandlers(again);
              recognitionRef.current = again;
              again.start();
            } catch {
              keepListeningRef.current = false;
              setPhase("idle");
              setMediaMessage("Voice input stopped. Press Answer or type.");
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
      window.setTimeout(() => {
        if (listenGenerationRef.current !== generation || !keepListeningRef.current) return;
        try {
          try {
            recognition.abort?.();
          } catch {
            /* ignore */
          }
          const retry = new Constructor();
          retry.lang = recognition.lang;
          retry.interimResults = true;
          retry.continuous = true;
          retry.maxAlternatives = 3;
          bindHandlers(retry);
          recognitionRef.current = retry;
          retry.start();
        } catch {
          keepListeningRef.current = false;
          recognitionRef.current = null;
          setPhase("idle");
          setMediaMessage("Voice input could not be started. Press Answer or type.");
        }
      }, 280);
    }
  }, [media.microphone]);

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
      try {
        ttsAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      const generation = ++speakGenerationRef.current;
      void recorderRef.current.stop();
      setPhase(options?.kind === "feedback" || options?.kind === "bridge" ? "feedback" : "asking");
      setInterim("");
      setMediaMessage(
        options?.kind === "feedback" || options?.kind === "bridge"
          ? "Interviewer speaking… wait until they finish."
          : "Asking the question… listening starts after they finish.",
      );
      try {
        await speakInterviewLine(line, {
          kind: options?.kind ?? "general",
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
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
      if (isLiveSessionId(sessionId)) {
        const live = loadLiveInterview();
        if (!live) throw new Error("This live session is no longer available. Start a new round.");
        const answered = live.responses.filter((row) => (row.transcript || row.typed_response || "").trim());
        if (!answered.length) throw new Error("Answer at least one question before saving the session.");
        setMediaMessage("Saving your session and building the debrief…");
        const result = await apiRequest<{ session?: Session; message?: string }>(
          "/interviews/commit",
          {
            method: "POST",
            body: JSON.stringify({
              session: {
                mode: live.setup.mode,
                resume_version_id: live.setup.resume_version_id || null,
                job_description_id: live.setup.job_description_id || null,
                job_description_text: live.setup.job_description_text,
                target_role: live.setup.target_role,
                difficulty: live.setup.difficulty,
                question_count: live.setup.question_count,
                duration_minutes: Math.max(10, live.setup.question_count * 4),
                camera_enabled: live.setup.camera_enabled,
                microphone_enabled: live.setup.microphone_enabled,
                recording_consent: false,
              },
              questions: live.questions.map((question) => ({
                position: question.position,
                question: question.question,
                question_type: question.question_type,
                source_context: question.source_context,
              })),
              responses: answered.map((row) => ({
                position: row.position,
                typed_response: row.typed_response,
                transcript: row.transcript,
                duration_seconds: row.duration_seconds,
                speech_metrics: row.speech_metrics,
                gaze_metrics: row.gaze_metrics,
              })),
            }),
          },
        );
        clearLiveInterview();
        const savedId = result.session?.id;
        if (!savedId) throw new Error("The session was not saved. Try again.");
        setMessage(result.message || "Session saved. Opening your debrief…");
        setSession((s) => (s ? { ...s, id: savedId, status: "completed" } : s));
        setPhase("complete");
        setMediaMessage("Session saved. Review the debrief.");
        navigate(`/mock-interview/report/${savedId}`);
        return;
      }
      const result = await apiRequest<{ session?: Session; message?: string }>(
        `/interviews/${sessionId}/complete`,
        { method: "POST" },
      );
      setMessage(result.message || "Session complete. Opening your debrief…");
      setSession((s) => (s ? { ...s, status: "completed" } : s));
      setPhase("complete");
      setMediaMessage("Session complete. Review the debrief.");
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
        setMediaMessage("All questions answered. Building your debrief…");
        await completeSession();
        return;
      }
      setLastFeedback(null);
      setPhase("between");
      setActiveIndex(next);
    } finally {
      window.setTimeout(() => {
        advancingRef.current = false;
      }, 400);
    }
  }, [abortInterviewerSpeech, completeSession, stopRecognition]);

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
      /* click Continue still works */
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (listenGenerationRef.current !== generation) return;
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
          setMediaMessage("Press Continue when you are ready.");
        }
      }, 250);
    }
  }, [advanceAfterFeedback, media.microphone]);

  const runPostAnswerFlow = useCallback(
    (evaluation: AnswerEvaluation | null, followedUp: boolean) => {
      const next = nextActiveIndex(activeIndexRef.current, questionsRef.current.length);
      const isLast = next === null;
      const autoContinue = autoVoiceRef.current;
      const shortLine = spokenInterviewerReply(evaluation);
      setPhase("feedback");
      setMessage(shortLine);
      setMediaMessage(
        autoContinue
          ? isLast
            ? "Wrapping up…"
            : followedUp
              ? "Following up…"
              : "Next question…"
          : "Press Continue for the next question.",
      );
      // Live rounds skip spoken feedback/bridge so the next question starts immediately.
      if (isLiveSessionId(sessionId) && autoContinue) {
        setPhase(phaseAfterFeedbackSpoken(true));
        window.setTimeout(() => {
          void advanceAfterFeedback();
        }, DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS);
        return;
      }
      const bridge = followedUp
        ? "I want to stay with that for a moment."
        : buildProceedPrompt({ isLastQuestion: isLast, autoContinue });
      speakLine(
        shortLine,
        () => {
          if (phaseRef.current !== "feedback" && phaseRef.current !== "awaiting_proceed") return;
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
    [advanceAfterFeedback, sessionId, speakLine, startProceedListening],
  );

  const submitCurrentAnswer = useCallback(async () => {
    const q = questionsRef.current[activeIndexRef.current];
    if (!q || submittingRef.current) return;
    const committed = answerRef.current.trim();
    if (!committed) return;
    submittingRef.current = true;
    keepListeningRef.current = false;
    stopRecognition({ keepPhase: true });
    setInterim("");
    setPhase("saving");
    setSaving(true);
    setError("");
    setMessage("");
    const recorded = await recorderRef.current.stop();
    const speechDetected = recorderRef.current.speechDetected;
    let text = committed;
    // A typed answer does not need Whisper. In browsers that expose a silent
    // MediaRecorder, sending that blob can add a full transcription timeout to
    // an otherwise local live-interview turn.
    if (recorded && speechDetected && !committed) {
      setMediaMessage("Listening back through that answer…");
      const whispered = await transcribeInterviewAudio(recorded);
      const next = chooseAnswerTranscript({
        typedOrSpeech: text,
        whispered,
        speechDetected,
      });
      if (next) {
        text = next;
        answerRef.current = next;
        setAnswer(next);
      }
    }
    const elapsedMs = listenStartedAtRef.current > 0 ? Date.now() - listenStartedAtRef.current : 0;
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
    const speechMetrics = {
      duration_seconds: speech.duration_seconds,
      words_per_minute: speech.words_per_minute,
      pace_band: speech.pace_band,
      filler_count: speech.filler_count,
      filler_rate: speech.filler_rate,
      word_count: speech.word_count,
    };
    const gazePayload = {
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
    };
    try {
      if (isLiveSessionId(sessionId)) {
        const alreadyFollowed = q.question_type === "follow_up" || q.source_context?.kind === "follow_up";
        const followUpsUsed = questionsRef.current.filter(
          (item) => item.question_type === "follow_up" || item.source_context?.kind === "follow_up",
        ).length;
        const seedCount =
          loadLiveInterview()?.setup.question_count ||
          questionsRef.current.filter((item) => item.source_context?.kind !== "follow_up").length ||
          5;
        const turn = decideInterviewerTurn({
          answer: text,
          question: q.question,
          questionType: q.question_type,
          alreadyFollowedUp: alreadyFollowed,
          followUpsUsed,
          seedCount,
        });
        const evaluation: AnswerEvaluation = {
          spoken_reply: turn.spoken_reply,
          should_follow_up: turn.should_follow_up,
          follow_up_question: turn.follow_up_question,
          interviewer_feedback: turn.spoken_reply,
        };
        let followedUp = false;
        const nextLive = writeLiveInterview((live) => {
          const responses = [
            ...live.responses.filter((row) => row.questionId !== q.id),
            {
              questionId: q.id,
              position: q.position,
              typed_response: text,
              transcript: text,
              duration_seconds: Math.max(0, Math.round(speech.duration_seconds)),
              speech_metrics: speechMetrics,
              gaze_metrics: gazePayload,
              evaluation,
            },
          ];
          let questions = live.questions;
          const canFollow =
            turn.should_follow_up &&
            Boolean(turn.follow_up_question) &&
            !alreadyFollowed &&
            questions.length < maxLiveQuestionBudget(live.setup.question_count);
          if (canFollow && turn.follow_up_question) {
            followedUp = true;
            const insertAt = questions.findIndex((item) => item.id === q.id) + 1;
            const follow = liveFollowUpQuestion(
              `live-q-follow-${Date.now()}`,
              q.position + 1,
              turn.follow_up_question,
            );
            const shifted = questions.map((item, index) =>
              index >= insertAt ? { ...item, position: item.position + 1 } : item,
            );
            questions = [...shifted.slice(0, insertAt), follow, ...shifted.slice(insertAt)];
          }
          return { ...live, questions, responses };
        });
        if (nextLive) {
          setQuestions(nextLive.questions);
          questionsRef.current = nextLive.questions;
        }
        setLastFeedback(evaluation);
        setLastAnswerSnapshot(text);
        setSaving(false);
        submittingRef.current = false;
        runPostAnswerFlow(evaluation, followedUp);
        return;
      }
      const result = await apiRequest<{
        evaluation?: AnswerEvaluation;
        follow_up?: Question | null;
        questions?: Question[];
      }>(`/interviews/${sessionId}/responses`, {
        method: "POST",
        body: JSON.stringify({
          question_id: q.id,
          typed_response: text,
          transcript: text,
          duration_seconds: Math.max(0, Math.round(speech.duration_seconds)),
          speech_metrics: speechMetrics,
          gaze_metrics: gazePayload,
        }),
      });
      if (Array.isArray(result.questions) && result.questions.length) {
        setQuestions(result.questions);
        questionsRef.current = result.questions;
      }
      const evaluation = result.evaluation || null;
      setLastFeedback(evaluation);
      setLastAnswerSnapshot(text);
      runPostAnswerFlow(evaluation, Boolean(result.follow_up));
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }, [runPostAnswerFlow, sessionId, stopRecognition]);

  useEffect(() => {
    if (!sessionId) return;
    if (isLiveSessionId(sessionId)) {
      const live = loadLiveInterview();
      if (!live || live.id !== sessionId) {
        setError("This live session is no longer available. Start a new round.");
        setLoading(false);
        return;
      }
      setSession(liveToSession(live));
      setQuestions(live.questions);
      questionsRef.current = live.questions;
      setLoading(false);
      return;
    }
    let active = true;
    apiRequest<{ session: Session; questions: Question[] }>(`/interviews/${sessionId}`)
      .then((payload) => {
        if (!active) return;
        setSession(payload.session);
        setQuestions(payload.questions || []);
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

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const flags = sessionMediaFlags(session);
    if (!flags.camera) {
      setMediaMessage(mediaReadyMessage(false, flags.microphone));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaMessage("This browser does not support camera access. Voice and typing still work.");
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
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
          void video.play().catch(() => undefined);
        }
        if (!gazeDetectorRef.current) {
          const det = createFaceDetector();
          gazeDetectorRef.current = det;
          setGazeSupported(true);
          gazeDetectorKindRef.current = det ? "face_detector" : "canvas_presence";
        }
        setMediaMessage(`${mediaReadyMessage(true, flags.microphone)} Camera presence is on.`);
      })
      .catch(() => {
        if (!cancelled) {
          setGazeSupported(false);
          setMediaMessage("Camera permission was not granted. You can still use voice or type.");
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!sessionId) return;
    void fetchInterviewTtsStatus().catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    if (!media.camera || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  }, [media.camera, current?.id]);

  useEffect(() => {
    if (!media.camera || phase !== "listening") return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    if (!gazeDetectorRef.current) gazeDetectorRef.current = createFaceDetector();
    if (!gazeCanvasRef.current && typeof document !== "undefined") {
      gazeCanvasRef.current = document.createElement("canvas");
    }
    setGazeSupported(true);
    const sample = async () => {
      if (cancelled || phaseRef.current !== "listening") return;
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
        if (result.detector !== "unavailable") gazeDetectorKindRef.current = result.detector;
        const entry: GazeSample = {
          at: Date.now(),
          state: result.state === "unavailable" ? "no_face" : result.state,
          center_score: result.center_score,
        };
        if (entry.state === "looking") gazeAwaySinceRef.current = null;
        else if (gazeAwaySinceRef.current === null) gazeAwaySinceRef.current = entry.at;
        gazeSamplesRef.current = [...gazeSamplesRef.current, entry].slice(-600);
        recentGazeStatesRef.current = [...recentGazeStatesRef.current, entry.state].slice(-12);
        setGazeCoach(liveGazeCoachMessage(recentGazeStatesRef.current));
      } catch {
        /* keep sampling */
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
            ? "Press Answer or type, then submit."
            : "Type your answer, then submit to continue.",
        );
      }
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const spoken = spokenQuestionLine({
        question: current.question,
        isFirst: activeIndexRef.current === 0,
        isFollowUp:
          current.question_type === "follow_up" || current.source_context?.kind === "follow_up",
        role: session?.target_role,
      });
      speakQuestion(spoken, afterSpoken);
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
      recorderRef.current.dispose();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [abortInterviewerSpeech, stopRecognition],
  );

  function toggleVoiceAnswer() {
    if (phase === "listening" || recognitionRef.current) {
      stopRecognition();
      setMediaMessage("Listening stopped. Edit your answer or submit.");
      return;
    }
    if (isInterviewSpeechBusy()) {
      setMediaMessage("Wait for the interviewer to finish, then try again.");
      return;
    }
    cancelInterviewSpeech();
    startListening();
  }

  function repeatQuestion() {
    if (!current?.question) return;
    const spoken = spokenQuestionLine({
      question: current.question,
      isFirst: activeIndex === 0,
      isFollowUp: isFollowUp,
      role: session?.target_role,
    });
    speakQuestion(spoken, () => {
      const nextPhase = phaseAfterQuestionSpoken(media.microphone, autoVoice);
      if (nextPhase === "listening") {
        scheduleListenAfterQuestionSpoken(() => startListening(), {
          maxWaitMs: DEFAULT_TTS_MAX_WAIT_MS,
          isBusy: () => isInterviewSpeechBusy(),
        });
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
      if (isLiveSessionId(sessionId)) {
        clearLiveInterview();
        navigate("/mock-interview");
        return;
      }
      await apiRequest(`/interviews/${sessionId}`, { method: "DELETE" });
      navigate("/mock-interview");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="interview-session-page">
        <LoadingState label="Preparing your session" variant="Orbit" />
      </div>
    );
  }

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
      <header className="interview-session-bar">
        <div className="interview-session-bar-copy">
          <p className="interview-kicker">
            {(session?.target_role || "Practice").trim()} · {(session?.mode || "mixed").replaceAll("_", " ")}
          </p>
          <h1>
            {questions.length
              ? isFollowUp
                ? `Follow-up ${activeIndex + 1} of ${questions.length}`
                : `Question ${activeIndex + 1} of ${questions.length}`
              : "Interview room"}
          </h1>
        </div>
        <ol className="interview-pips" aria-label="Question progress">
          {questions.map((question, index) => (
            <li
              key={question.id || index}
              className={index === activeIndex ? "is-current" : index < activeIndex ? "is-done" : ""}
            >
              <span className="visually-hidden">
                {question.question_type === "follow_up" ? "Follow-up" : "Question"} {index + 1}
              </span>
            </li>
          ))}
        </ol>
        <Link className="button button-secondary interview-leave" href="/mock-interview">
          Leave
        </Link>
      </header>

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}

      <div className="interview-room">
        {questions.length > 0 && current ? (
          <article className="interview-bubble is-agent">
            <p className="interview-bubble-meta">
              {isFollowUp ? "Follow-up" : current.question_type || "Question"}
            </p>
            <h2>{current.question}</h2>
          </article>
        ) : null}
        <aside className="interview-presence">
          <div className="interview-aura-stage" aria-label={`Interviewer ${auraState}`}>
            <AgentAudioVisualizerAura
              size="md"
              color="#3a7ca5"
              colorShift={0.18}
              state={auraState}
              themeMode={resolvedTheme}
              className="interview-agent-aura"
            />
            <span className="interview-aura-label">
              {auraState === "speaking"
                ? "Speaking"
                : auraState === "listening"
                  ? "Your turn"
                  : auraState === "thinking"
                    ? "Considering"
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
              />
              <span className="interview-video-label">You</span>
              {gazeCoach ? (
                <p role="status" className="interview-gaze-coach">
                  {gazeCoach}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="interview-presence-note">Camera is off. Voice and typing still work.</p>
          )}
          <p className="interview-presence-status" role="status">
            <span className="interview-live-dot" data-active={phase === "listening" || phase === "asking"} />
            {phaseCopy(phase)}
          </p>
          <label className="interview-toggle">
            <input
              type="checkbox"
              checked={autoVoice}
              onChange={(event) => setAutoVoice(event.target.checked)}
              disabled={!media.microphone}
            />
            Hands-free
          </label>
          {!speechSupported ? (
            <p className="field-error" style={{ margin: 0 }}>
              This browser has no speech recognition. Typing still works.
            </p>
          ) : null}
          {gazeSupported && media.camera && phase === "listening" ? (
            <p className="interview-presence-note">Keep your face in frame while you answer.</p>
          ) : null}
        </aside>

        <section className="interview-dialog">
          {!questions.length ? (
            <div className="interview-empty-session">
              <h2>No questions in this session</h2>
              <p>Start a new round from the mock interview page.</p>
              <div className="interview-composer-actions">
                <Link className="button button-primary" href="/mock-interview">
                  Start a new round
                </Link>
                <Button variant="destructive" disabled={deleting} onClick={() => void deleteThisSession()}>
                  {deleting ? "Deleting…" : "Delete session"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {lastAnswerSnapshot && (phase === "feedback" || phase === "awaiting_proceed" || phase === "between") ? (
                <article className="interview-bubble is-you">
                  <p className="interview-bubble-meta">You</p>
                  <p>{lastAnswerSnapshot}</p>
                </article>
              ) : null}

              {lastFeedback && (phase === "feedback" || phase === "awaiting_proceed" || phase === "between") ? (
                <article className="interview-bubble is-agent is-reply">
                  <p className="interview-bubble-meta">Interviewer</p>
                  <p>{spokenInterviewerReply(lastFeedback)}</p>
                  {lastFeedback.improvements?.[0] ? (
                    <p className="interview-coach-tip">{lastFeedback.improvements[0]}</p>
                  ) : null}
                </article>
              ) : null}

              <div className="interview-composer">
                <label className="interview-field">
                  <span className="interview-field-label">
                    Your answer
                    {phase === "listening" ? " — live as you speak" : ""}
                  </span>
                  <Textarea
                    value={liveTranscript}
                    onChange={(event: { target: { value: string } }) => onAnswerChange(event.target.value)}
                    placeholder={
                      media.microphone
                        ? "Speak after the question, or type here."
                        : "Type your answer here."
                    }
                    disabled={phase === "asking" || phase === "saving" || phase === "between"}
                  />
                </label>
                {phase === "listening" ? (
                  <p className="interview-composer-hint" role="status">
                    {interim
                      ? `Hearing now: “${interim}”`
                      : answer
                        ? "Listening for more. Pause when you are finished, or submit."
                        : "Listening… start speaking."}
                  </p>
                ) : (
                  <p className="interview-composer-hint">{mediaMessage || message}</p>
                )}
                <div className="interview-composer-actions">
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
                    {saving ? "Considering…" : "Submit answer"}
                  </Button>
                  {media.microphone ? (
                    <Button
                      variant="secondary"
                      onClick={toggleVoiceAnswer}
                      disabled={!current || phase === "asking" || phase === "saving"}
                    >
                      {phase === "listening" ? "Stop listening" : "Answer"}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={repeatQuestion}
                    disabled={!current || phase === "asking" || phase === "saving"}
                  >
                    Repeat question
                  </Button>
                  {phase === "awaiting_proceed" ? (
                    <Button onClick={() => void advanceAfterFeedback()} disabled={saving}>
                      {activeIndex >= questions.length - 1 ? "Go to debrief" : "Continue"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
