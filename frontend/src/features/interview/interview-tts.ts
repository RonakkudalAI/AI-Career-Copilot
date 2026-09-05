/**
 * Mock-interview TTS: Groq Orpheus, then NVIDIA Magpie, then Fish, then browser.
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
  /** Prefer Groq Orpheus when available (default true). */
  preferServer?: boolean;
  /** @deprecated Use preferServer. Kept so existing callers still compile. */
  preferFish?: boolean;
};

export type TtsStatus = {
  provider: string | null;
  configured: boolean;
  model?: string | null;
  voice?: string | null;
  fallback?: string;
  fallbacks?: string[];
  stt_provider?: string | null;
  stt_configured?: boolean;
};

let cachedStatus: TtsStatus | null = null;
let statusFetchedAt = 0;
const STATUS_TTL_MS = 60_000;
/** Server may try Groq then NVIDIA. Keep this long enough, then use the browser. */
const SERVER_TTS_FETCH_MS = 28_000;

/** Active HTMLAudioElement so we can cancel cleanly between turns. */
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let preferredVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

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

export async function interviewAuthHeaders(json = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (isDemoSession()) return headers;
  const authClient = createAuthClient();
  const {
    data: { session },
  } = await authClient.auth.getSession();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function fetchInterviewTtsStatus(force = false): Promise<TtsStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - statusFetchedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }
  try {
    const base = resolveApiBase();
    const headers = await interviewAuthHeaders();
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
        voice: body.voice ?? null,
        fallback: body.fallback || "browser_speech_synthesis",
        fallbacks: Array.isArray(body.fallbacks) ? body.fallbacks : undefined,
        stt_provider: body.stt_provider ?? null,
        stt_configured: Boolean(body.stt_configured),
      };
    }
  } catch {
    cachedStatus = { provider: null, configured: false, fallback: "browser_speech_synthesis" };
  }
  statusFetchedAt = now;
  return cachedStatus;
}

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const live = signals.filter((item): item is AbortSignal => Boolean(item));
  if (!live.length) return undefined;
  if (live.length === 1) return live[0];
  const anyFn = (AbortSignal as unknown as { any?: (list: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(live);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

async function fetchServerTtsBlob(text: string, kind: InterviewTtsKind, signal?: AbortSignal): Promise<Blob> {
  const base = resolveApiBase();
  const headers = await interviewAuthHeaders();
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), SERVER_TTS_FETCH_MS);
  const combined = mergeAbortSignals([signal, timeout.signal]);
  try {
    const res = await fetch(`${base}/interviews/tts`, {
      method: "POST",
      credentials: "include",
      headers,
      signal: combined,
      body: JSON.stringify({ text, kind }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Server TTS failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
    }
    const blob = await res.blob();
    if (!blob || blob.size < 32) {
      throw new Error("Server TTS returned empty audio");
    }
    return blob;
  } finally {
    window.clearTimeout(timer);
  }
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

    const estimatedMs = Math.min(90_000, Math.max(8_000, (blob.size / 16) * 1000 + 2_000));
    window.setTimeout(() => {
      if (!settled && audio.ended) finish();
      else if (!settled && audio.paused && audio.currentTime > 0) finish();
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

function scoreInterviewerVoice(voice: SpeechSynthesisVoice): number {
  const name = (voice.name || "").toLowerCase();
  const lang = (voice.lang || "").toLowerCase();
  let score = 0;
  if (lang.startsWith("en")) score += 12;
  if (lang.startsWith("en-gb") || lang.startsWith("en-us") || lang.startsWith("en-au")) score += 4;
  if (name.includes("google") && lang.includes("en-gb")) score += 10;
  if (name.includes("google") && lang.startsWith("en")) score += 6;
  if (/(aria|andrew|guy|ryan|jenny|sonia|george|libby|samantha|daniel|karen|moira|tessa|ravi)/.test(name)) {
    score += 8;
  }
  if (name.includes("natural") || name.includes("neural") || name.includes("online")) score += 5;
  if (voice.localService) score += 1;
  if (/(zira|david|mark|espeak|microsoft david|microsoft zira)/.test(name)) score -= 6;
  return score;
}

function pickInterviewerVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  voicesLoaded = true;
  const ranked = [...voices].sort((a, b) => scoreInterviewerVoice(b) - scoreInterviewerVoice(a));
  preferredVoice = ranked[0] || null;
  return preferredVoice;
}

function warmVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || voicesLoaded) return;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      pickInterviewerVoice();
      return;
    }
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        pickInterviewerVoice();
      },
      { once: true },
    );
  } catch {
    /* ignore */
  }
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
    const voice = pickInterviewerVoice();
    const hasVoices = Boolean(voice) || window.speechSynthesis.getVoices().length > 0;

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

    if (!hasVoices) {
      // Headless / no voice pack — don't block the interview on a hung synthesizer.
      window.setTimeout(() => finish(), Math.min(900, 280 + text.length * 6));
      return;
    }

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
      utterance.rate = 0.96;
      utterance.pitch = 1;
      utterance.lang = voice?.lang || "en-US";
      if (voice) utterance.voice = voice;
      const advance = () => {
        if (settled || token !== chunkToken) return;
        speakNext();
      };
      utterance.onend = advance;
      utterance.onerror = advance;
      const chunkMs = Math.min(45_000, Math.max(4_000, 2000 + chunk.length * 80));
      window.setTimeout(() => {
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
    window.setTimeout(() => finish(), Math.min(90_000, 4000 + text.length * 60));
    speakNext();
  });
}

/**
 * Speak interviewer text fully, then resolve.
 * Prefer server TTS (Groq, then NVIDIA, then Fish); fall back to browser speechSynthesis.
 * Does not resolve until playback ends (or abort / hard failure).
 */
export async function speakInterviewLine(text: string, options?: SpeakOptions): Promise<void> {
  const line = String(text || "").trim();
  if (!line) return;
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  warmVoices();
  // Demo sessions must remain deterministic and local. They use the browser
  // fallback so a configured remote provider cannot hold the interview in the
  // speaking state or make the answer controls appear permanently disabled.
  const preferServer =
    options?.preferServer !== false && options?.preferFish !== false && !isDemoSession();
  const kind = options?.kind ?? "general";

  if (preferServer) {
    try {
      const status = await fetchInterviewTtsStatus();
      if (status.configured) {
        const blob = await fetchServerTtsBlob(line, kind, options?.signal);
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
