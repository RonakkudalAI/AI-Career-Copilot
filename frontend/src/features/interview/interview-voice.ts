/**
 * Pure mock-interview voice helpers (no browser APIs).
 * Keeps speech parsing + turn sequencing testable without Web Speech / getUserMedia.
 */

export type InterviewTurnPhase =
  | "idle"
  | "asking"
  | "listening"
  | "saving"
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
    const alt = row[0];
    const text = String(alt?.transcript || "").trim();
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

export const DEFAULT_ANSWER_SILENCE_MS = 2200;
export const DEFAULT_LISTEN_AFTER_TTS_MS = 350;
