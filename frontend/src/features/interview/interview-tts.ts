/**
 * Mock-interview TTS: Fish Audio (server proxy) with browser speechSynthesis fallback.
 * Guarantees full utterance playback before resolving — never advances mid-sentence.
 */

import { createClient as createAuthClient } from "@/features/auth/api/client";
import { isDemoSession } from "@/features/auth/demo-session";
import { resolveApiBase } from "@/shared/config";

export type InterviewTtsKind = "question" | "feedback" | "bridge" | "general";

export type SpeakOptions = {
  kind?: InterviewTtsKind;
  /** Called when playback is cancelled (navigation / next turn). */
  signal?: AbortSignal;
  /** Prefer Fish Audio when available (default true). */
  preferFish?: boolean;
};

type TtsStatus = {
  provider: string | null;
  configured: boolean;
  model?: string | null;
  fallback?: string;
};

let cachedStatus: TtsStatus | null = null;
let statusFetchedAt = 0;
const STATUS_TTL_MS = 60_000;

/** Active HTMLAudioElement so we can cancel cleanly between turns. */
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

export function cancelInterviewSpeech(): void {
  if (activeAudio) {
    try {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl);
    } catch {
      /* ignore */
    }
    activeObjectUrl = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function isInterviewSpeechBusy(): boolean {
  if (activeAudio && !activeAudio.paused && !activeAudio.ended) return true;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    return Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
  } catch {
    return false;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (isDemoSession()) {
    return { "Content-Type": "application/json" };
  }
  const authClient = createAuthClient();
  const {
    data: { session },
  } = await authClient.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session has expired. Sign in again.");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchInterviewTtsStatus(force = false): Promise<TtsStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - statusFetchedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }
  if (isDemoSession()) {
    cachedStatus = { provider: null, configured: false, fallback: "browser_speech_synthesis" };
    statusFetchedAt = now;
    return cachedStatus;
  }
  try {
    const base = resolveApiBase();
    const headers = await authHeaders();
    const res = await fetch(`${base}/interviews/tts/status`, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!res.ok) {
      cachedStatus = { provider: null, configured: false, fallback: "browser_speech_synthesis" };
    } else {
      const body = (await res.json()) as TtsStatus;
      cachedStatus = {
        provider: body.provider ?? null,
        configured: Boolean(body.configured),
        model: body.model ?? null,
        fallback: body.fallback || "browser_speech_synthesis",
      };
    }
  } catch {
    cachedStatus = { provider: null, configured: false, fallback: "browser_speech_synthesis" };
  }
  statusFetchedAt = now;
  return cachedStatus;
}

async function fetchFishAudioBlob(text: string, kind: InterviewTtsKind, signal?: AbortSignal): Promise<Blob> {
  const base = resolveApiBase();
  const headers = await authHeaders();
  const res = await fetch(`${base}/interviews/tts`, {
    method: "POST",
    credentials: "include",
    headers,
    signal,
    body: JSON.stringify({ text, kind }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Fish TTS failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  const blob = await res.blob();
  if (!blob || blob.size < 32) {
    throw new Error("Fish TTS returned empty audio");
  }
  return blob;
}

function playBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    cancelInterviewSpeech();
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const url = URL.createObjectURL(blob);
    activeObjectUrl = url;
    const audio = new Audio(url);
    activeAudio = audio;
    let settled = false;

    const cleanup = () => {
      if (activeAudio === audio) activeAudio = null;
      if (activeObjectUrl === url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
        activeObjectUrl = null;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      finish(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Audio playback failed"));

    // Safety: never hang forever if ended never fires.
    // Estimate from size (~16KB/s for 128kbps mp3) + cushion, min 8s max 90s.
    const estimatedMs = Math.min(90_000, Math.max(8_000, (blob.size / 16) * 1000 + 2_000));
    window.setTimeout(() => {
      if (!settled && audio.ended) finish();
      else if (!settled && audio.paused && audio.currentTime > 0) finish();
      // If still playing past estimate, give extra 30s then force-complete (do not cancel early).
    }, estimatedMs + 30_000);
    window.setTimeout(() => {
      if (!settled) finish();
    }, estimatedMs + 60_000);

    void audio.play().catch((err) => finish(err instanceof Error ? err : new Error("play() failed")));
  });
}

/** Split long lines into sentence-sized chunks so Chrome does not drop long utterances. */
function splitForBrowserTts(text: string, maxChunk = 220): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunk) return [cleaned];
  const parts = cleaned.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (!part) continue;
    if (!buf) {
      buf = part;
      continue;
    }
    if (`${buf} ${part}`.length <= maxChunk) {
      buf = `${buf} ${part}`;
    } else {
      chunks.push(buf);
      buf = part;
    }
  }
  if (buf) chunks.push(buf);
  // Hard-split any remaining oversized piece.
  const final: string[] = [];
  for (const chunk of chunks.length ? chunks : [cleaned]) {
    if (chunk.length <= maxChunk) {
      final.push(chunk);
      continue;
    }
    let i = 0;
    while (i < chunk.length) {
      final.push(chunk.slice(i, i + maxChunk));
      i += maxChunk;
    }
  }
  return final;
}

function speakWithBrowser(text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    cancelInterviewSpeech();
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const chunks = splitForBrowserTts(text);
    if (!chunks.length) {
      resolve();
      return;
    }

    let settled = false;
    let index = 0;
    let chunkToken = 0;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      finish(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const speakNext = () => {
      if (settled || signal?.aborted) {
        finish(signal?.aborted ? new DOMException("Aborted", "AbortError") : undefined);
        return;
      }
      if (index >= chunks.length) {
        finish();
        return;
      }
      const chunk = chunks[index];
      index += 1;
      const token = ++chunkToken;
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = 1;
      utterance.pitch = 1;
      const advance = () => {
        if (settled || token !== chunkToken) return;
        speakNext();
      };
      utterance.onend = advance;
      utterance.onerror = advance; // keep going so the full script is attempted
      // Per-chunk safety — only after a generous read time for this piece.
      const chunkMs = Math.min(45_000, Math.max(4_000, 2000 + chunk.length * 80));
      window.setTimeout(() => {
        // If this chunk hung, advance rather than strand the interview.
        if (!settled && token === chunkToken) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* ignore */
          }
          speakNext();
        }
      }, chunkMs);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        speakNext();
      }
    };

    void window.speechSynthesis.getVoices();
    // Overall hard ceiling so a broken synthesizer cannot block forever.
    window.setTimeout(() => finish(), Math.min(120_000, 5000 + text.length * 90));
    speakNext();
  });
}

/**
 * Speak interviewer text fully, then resolve.
 * Prefer Fish Audio when configured; fall back to browser speechSynthesis.
 * Does not resolve until playback ends (or abort / hard failure).
 */
export async function speakInterviewLine(text: string, options?: SpeakOptions): Promise<void> {
  const line = String(text || "").trim();
  if (!line) return;
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const preferFish = options?.preferFish !== false;
  const kind = options?.kind ?? "general";

  if (preferFish && !isDemoSession()) {
    try {
      const status = await fetchInterviewTtsStatus();
      if (status.configured) {
        const blob = await fetchFishAudioBlob(line, kind, options?.signal);
        if (options?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        await playBlob(blob, options?.signal);
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // Fall through to browser TTS — never leave the interview silent.
    }
  }

  await speakWithBrowser(line, options?.signal);
}

/**
 * Wait until any interviewer audio has fully finished, then optionally delay.
 * Unlike the old helper, this NEVER cancels speech early.
 */
export function waitUntilInterviewSpeechIdle(options?: {
  pollMs?: number;
  maxWaitMs?: number;
  afterIdleMs?: number;
  isCancelled?: () => boolean;
}): Promise<void> {
  const pollMs = options?.pollMs ?? 120;
  const maxWaitMs = options?.maxWaitMs ?? 120_000;
  const afterIdleMs = options?.afterIdleMs ?? 500;
  const started = Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      if (options?.isCancelled?.()) {
        resolve();
        return;
      }
      if (isInterviewSpeechBusy() && Date.now() - started < maxWaitMs) {
        window.setTimeout(tick, pollMs);
        return;
      }
      window.setTimeout(() => {
        if (options?.isCancelled?.()) {
          resolve();
          return;
        }
        resolve();
      }, afterIdleMs);
    };
    tick();
  });
}
