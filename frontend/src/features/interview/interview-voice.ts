/**
 * Pure mock-interview voice helpers (no browser APIs).
 * Keeps speech parsing + turn sequencing testable without Web Speech / getUserMedia.
 */

export type InterviewTurnPhase =
  | "idle"
  | "asking"
  | "listening"
  | "saving"
  | "feedback"
  | "awaiting_proceed"
  | "between"
  | "complete";

export type SpeechResultLike = {
  isFinal?: boolean;
  length?: number;
  [index: number]: { transcript?: string } | undefined;
};

export type SpeechResultListLike = {
  length: number;
  [index: number]: SpeechResultLike | undefined;
};

/** Common English fillers / hedges — mirrors backend evaluator list for live UX. */
export const FILLER_PHRASES = [
  "um",
  "uh",
  "uhm",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
  "right",
  "so yeah",
  "and stuff",
] as const;

function alternativeTranscripts(row: SpeechResultLike): string[] {
  const length = typeof row.length === "number" && row.length > 0 ? row.length : 1;
  const found: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const text = String(row[i]?.transcript || "").trim();
    if (text) found.push(text);
  }
  if (!found.length) {
    const fallback = String(row[0]?.transcript || "").trim();
    if (fallback) found.push(fallback);
  }
  return found;
}

function fillerHits(text: string): number {
  const lower = (text || "").toLowerCase();
  let count = 0;
  for (const phrase of FILLER_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const hits = lower.match(pattern);
    if (hits?.length) count += hits.length;
  }
  return count;
}

/** Prefer the recognition alternative that kept fillers / more of the utterance. */
export function pickFillerRichAlternative(alternatives: Array<string | undefined | null>): string {
  const cleaned = alternatives.map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length === 1) return cleaned[0];
  return [...cleaned].sort((a, b) => {
    const fillerDelta = fillerHits(b) - fillerHits(a);
    if (fillerDelta !== 0) return fillerDelta;
    return b.length - a.length;
  })[0];
}

/** Extract final + interim text from a SpeechRecognition result list. */
export function extractSpeechTranscript(
  results: SpeechResultListLike | ArrayLike<SpeechResultLike | undefined> | null | undefined,
  resultIndex = 0,
): { finalChunk: string; interimText: string } {
  if (!results || typeof (results as { length?: number }).length !== "number") {
    return { finalChunk: "", interimText: "" };
  }
  const list = results as SpeechResultListLike;
  const start = Math.max(0, Math.min(resultIndex, list.length));
  const finals: string[] = [];
  let interim = "";
  for (let i = start; i < list.length; i += 1) {
    const row = list[i];
    if (!row) continue;
    const text = pickFillerRichAlternative(alternativeTranscripts(row));
    if (!text) continue;
    if (row.isFinal) finals.push(text);
    else interim = text;
  }
  return {
    finalChunk: finals.join(" ").trim(),
    interimText: interim,
  };
}

/** Merge newly finalized speech into the committed answer and build display text. */
export function mergeSpokenAnswer(
  committed: string,
  finalChunk: string,
  interimText: string,
): { committed: string; display: string } {
  let next = (committed || "").trim();
  const chunk = (finalChunk || "").trim();
  if (chunk) {
    next = next ? `${next} ${chunk}` : chunk;
  }
  const interim = (interimText || "").trim();
  const display = interim ? (next ? `${next} ${interim}` : interim) : next;
  return { committed: next, display };
}

export function mediaReadyMessage(camera: boolean, microphone: boolean): string {
  if (camera && microphone) return "Camera and microphone are ready.";
  if (camera) return "Camera is ready.";
  if (microphone) return "Microphone is ready.";
  return "Camera and microphone are disabled for this session.";
}

/** Prefer explicit flags; missing/undefined defaults to enabled for practice UX. */
export function sessionMediaFlags(session: {
  camera_enabled?: boolean | null;
  microphone_enabled?: boolean | null;
}): { camera: boolean; microphone: boolean } {
  return {
    camera: session.camera_enabled !== false,
    microphone: session.microphone_enabled !== false,
  };
}

export function phaseAfterQuestionSpoken(microphoneEnabled: boolean, autoVoice: boolean): InterviewTurnPhase {
  if (microphoneEnabled && autoVoice) return "listening";
  return "idle";
}

export function shouldAutoSubmitOnSilence(options: {
  phase: InterviewTurnPhase;
  committedAnswer: string;
  msSinceLastSpeech: number;
  silenceMs: number;
}): boolean {
  if (options.phase !== "listening") return false;
  if (!options.committedAnswer.trim()) return false;
  return options.msSinceLastSpeech >= options.silenceMs;
}

/** Next question index, or null when the session should complete. */
export function nextActiveIndex(current: number, total: number): number | null {
  if (total <= 0) return null;
  if (current < 0) return 0;
  if (current + 1 >= total) return null;
  return current + 1;
}

/**
 * Compact interviewer line for spoken debrief between questions.
 * Uses only measured evaluation fields — does not invent content.
 */
export function spokenInterviewerReply(evaluation: {
  spoken_reply?: string | null;
  interviewer_feedback?: string | null;
  verdict?: string | null;
  score?: number | null;
  strengths?: string[] | null;
  improvements?: string[] | null;
  better_approach?: string | null;
  filler_notes?: string | null;
} | null): string {
  const spoken = String(evaluation?.spoken_reply || "").trim();
  if (spoken) return spoken.slice(0, 340);
  const feedback = String(evaluation?.interviewer_feedback || "").trim();
  if (feedback && !/\b\d+\s*\/\s*100\b/.test(feedback) && !/\bscore\b/i.test(feedback)) {
    return feedback.slice(0, 340);
  }
  return "Thanks, I've noted that. Let's continue.";
}

export function buildShortInterviewerLine(evaluation: {
  verdict?: string | null;
  score?: number | null;
  strengths?: string[] | null;
  improvements?: string[] | null;
  better_approach?: string | null;
  filler_notes?: string | null;
}): string {
  const verdict = String(evaluation.verdict || "reviewed").replaceAll("_", " ");
  const score =
    typeof evaluation.score === "number" && Number.isFinite(evaluation.score)
      ? Math.max(0, Math.min(100, Math.round(evaluation.score)))
      : null;
  const strength = (evaluation.strengths || []).map(String).find((s) => s.trim())?.trim();
  const tip =
    (evaluation.improvements || []).map(String).find((s) => s.trim())?.trim() ||
    String(evaluation.better_approach || "").trim() ||
    "";

  let line =
    score != null
      ? `Thanks. That was ${verdict} — about ${score} out of 100.`
      : `Thanks. That was ${verdict}.`;
  if (strength) {
    line += ` Good point: ${strength.replace(/\.$/, "")}.`;
  }
  if (tip) {
    line += ` Next time: ${tip.replace(/\.$/, "")}.`;
  }
  // Keep TTS short so the interview stays conversational.
  return line.slice(0, 340).trim();
}

/** Spoken bridge before the next question (or session wrap-up). */
export function buildProceedPrompt(options: {
  isLastQuestion: boolean;
  autoContinue: boolean;
}): string {
  if (options.isLastQuestion) {
    return options.autoContinue
      ? "That was the last question. I'll wrap up your debrief now."
      : "That was the last question. Say proceed when you are ready for your debrief, or press Continue.";
  }
  if (options.autoContinue) {
    return "Moving to the next question.";
  }
  return "Shall we move to the next question? Say proceed, yes, or next — or press Continue.";
}

/** Detect affirmative / proceed intents from short voice commands. */
export function isProceedIntent(text: string): boolean {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  // Whole-phrase yes-style answers
  if (/^(yes|yeah|yep|yup|sure|ok|okay|proceed|continue|next|go|ready)$/.test(t)) {
    return true;
  }
  return /\b(yes|yeah|yep|yup|sure|ok|okay|proceed|continue|next question|next|go ahead|go on|move on|let's go|lets go|i'm ready|im ready|please)\b/.test(
    t,
  );
}

/** Detect hold / not-yet intents so we do not skip ahead. */
export function isHoldIntent(text: string): boolean {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (isProceedIntent(t) && !/\b(no|wait|hold|pause|not yet|stop)\b/.test(t)) {
    // "yes proceed" should not also count as hold
    return false;
  }
  return /\b(wait|hold|pause|stop|not yet|no|hang on|one moment|give me a (sec|second|minute))\b/.test(
    t,
  );
}

/**
 * After short feedback, decide the next control path.
 * - autoContinue: advance without waiting for the candidate
 * - otherwise: ask and wait for proceed (voice or click)
 */
export function phaseAfterFeedbackSpoken(autoContinue: boolean): InterviewTurnPhase {
  return autoContinue ? "between" : "awaiting_proceed";
}

/** Silence before auto-submit. Long enough to finish a thought without feeling stuck. */
export const DEFAULT_ANSWER_SILENCE_MS = 2400;
/** Wait after interviewer audio fully ends before opening SpeechRecognition. */
export const DEFAULT_LISTEN_AFTER_TTS_MS = 250;
/** Brief beat after an answer before the next question. */
export const DEFAULT_AUTO_ADVANCE_AFTER_FEEDBACK_MS = 150;
/** How long we listen for "proceed" before showing a soft prompt again. */
export const DEFAULT_PROCEED_LISTEN_MS = 12000;
/**
 * Max time to wait for interviewer audio to finish before listening.
 * Must be long enough for full questions + Groq Orpheus network; never cut mid-sentence.
 */
export const DEFAULT_TTS_MAX_WAIT_MS = 120_000;

export type LiveSpeakingMetrics = {
  word_count: number;
  duration_seconds: number;
  words_per_minute: number | null;
  pace_band: "unknown" | "slow" | "steady" | "fast" | "rushed";
  pace_notes: string;
  filler_count: number;
  filler_rate: number;
  filler_unique: string[];
  filler_counts: Record<string, number>;
  filler_notes: string;
};

function countWords(text: string): number {
  const matches = (text || "").toLowerCase().match(/[a-z']+/g);
  return matches ? matches.length : 0;
}

/** Deterministic live pace + filler metrics from transcript + elapsed ms. */
export function analyzeLiveSpeaking(
  text: string,
  durationMs: number,
): LiveSpeakingMetrics {
  const raw = (text || "").trim();
  const word_count = countWords(raw);
  const duration_seconds = Math.max(0, durationMs / 1000);
  let words_per_minute: number | null = null;
  if (duration_seconds >= 1 && word_count > 0) {
    words_per_minute = Math.round((word_count / duration_seconds) * 60 * 10) / 10;
  }

  const lower = raw.toLowerCase();
  const filler_counts: Record<string, number> = {};
  let filler_count = 0;
  for (const phrase of FILLER_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const hits = lower.match(pattern);
    if (hits?.length) {
      filler_counts[phrase] = hits.length;
      filler_count += hits.length;
    }
  }
  const denom = Math.max(word_count, 1);
  const filler_rate = Math.round((filler_count / denom) * 10000) / 10000;

  let pace_band: LiveSpeakingMetrics["pace_band"] = "unknown";
  let pace_notes =
    "Speaking pace needs a timed spoken answer (at least 1 second) to measure.";
  if (words_per_minute != null) {
    if (words_per_minute < 90) {
      pace_band = "slow";
      pace_notes = `Pace is deliberate (~${words_per_minute} wpm). Tighten the close if answers trail off.`;
    } else if (words_per_minute <= 165) {
      pace_band = "steady";
      pace_notes = `Pace is interview-friendly (~${words_per_minute} wpm). Prefer short pauses over fillers.`;
    } else if (words_per_minute <= 200) {
      pace_band = "fast";
      pace_notes = `Pace is quick (~${words_per_minute} wpm). Slow slightly between STAR beats.`;
    } else {
      pace_band = "rushed";
      pace_notes = `Pace is rushed (~${words_per_minute} wpm). Pause after the situation and before the result.`;
    }
  }

  let filler_notes = "No common filler phrases detected yet.";
  if (filler_count === 0) {
    filler_notes = "No common filler phrases detected so far.";
  } else if (filler_rate >= 0.08) {
    filler_notes = `High filler density (${filler_count}). Replace fillers with a short pause.`;
  } else if (filler_rate >= 0.03) {
    filler_notes = `Some fillers (${filler_count}). A brief silence is cleaner than “um” / “like”.`;
  } else {
    filler_notes = `Light filler use (${filler_count}). Keep answers deliberate.`;
  }

  return {
    word_count,
    duration_seconds: Math.round(duration_seconds * 10) / 10,
    words_per_minute,
    pace_band,
    pace_notes,
    filler_count,
    filler_rate,
    filler_unique: Object.keys(filler_counts).sort(),
    filler_counts,
    filler_notes,
  };
}

/** True when browser TTS is still producing audio (do not start recognition yet). */
export function isSpeechSynthesisBusy(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    return Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
  } catch {
    return false;
  }
}

/**
 * Schedule listening only after interviewer TTS has fully finished.
 *
 * CRITICAL: Never cancel speech early — that was cutting questions mid-sentence
 * and advancing the conversation while the interviewer was still talking.
 * We only open SpeechRecognition after audio is idle (or maxWaitMs for hung TTS).
 */
export function scheduleListenAfterQuestionSpoken(
  startListening: () => void,
  options?: {
    delayMs?: number;
    maxWaitMs?: number;
    isCancelled?: () => boolean;
    /** Optional external busy check (server TTS HTMLAudioElement, etc.). */
    isBusy?: () => boolean;
  },
): number {
  const delayMs = options?.delayMs ?? DEFAULT_LISTEN_AFTER_TTS_MS;
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_TTS_MAX_WAIT_MS;
  const started = Date.now();

  const busy = (): boolean => {
    if (options?.isBusy?.()) return true;
    return isSpeechSynthesisBusy();
  };

  const tryStart = (): void => {
    if (options?.isCancelled?.()) return;
    // Keep waiting while the interviewer is still talking — do NOT cancel mid-line.
    if (busy() && Date.now() - started < maxWaitMs) {
      window.setTimeout(tryStart, 120);
      return;
    }
    // Only cancel if still marked busy after max wait (hung synthesizer), so mic can open.
    if (busy() && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      if (options?.isCancelled?.()) return;
      startListening();
    }, delayMs);
  };

  return window.setTimeout(tryStart, 0) as unknown as number;
}
