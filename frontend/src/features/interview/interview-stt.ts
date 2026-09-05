/**
 * Accurate answer capture for mock interviews.
 * Web Speech is used for live captions; Groq Whisper (server) is the source of
 * truth so fillers like "um" / "uh" are kept instead of being cleaned away.
 */

import { resolveApiBase } from "@/shared/config";
import { interviewAuthHeaders } from "@/features/interview/interview-tts";

const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function chooseAnswerTranscript(options: {
  typedOrSpeech: string;
  whispered: string | null | undefined;
  speechDetected: boolean;
}): string {
  const typed = String(options.typedOrSpeech || "").trim();
  const whispered = String(options.whispered || "").trim();
  if (!whispered) return typed;
  if (!typed) return whispered;
  // Typed-only answers (e2e / mic-off edits) must not be overwritten by silence.
  if (!options.speechDetected) return typed;
  return whispered;
}

export async function transcribeInterviewAudio(
  blob: Blob,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!blob || blob.size < 600) return null;
  try {
    const base = resolveApiBase();
    const headers = await interviewAuthHeaders(false);
    const form = new FormData();
    const mime = blob.type || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    form.append("audio", blob, `answer.${ext}`);
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(), 12_000);
    const res = await fetch(`${base}/interviews/transcribe`, {
      method: "POST",
      credentials: "include",
      headers,
      body: form,
      signal: signal?.aborted ? signal : timeout.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as { transcript?: string };
    const text = String(body.transcript || "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export class AnswerRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  speechDetected = false;

  markSpeech(): void {
    this.speechDetected = true;
  }

  async start(): Promise<boolean> {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    this.speechDetected = false;
    this.chunks = [];
    try {
      if (!this.stream || this.stream.getAudioTracks().every((track) => track.readyState !== "live")) {
        this.disposeStream();
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }
      const mime = pickRecorderMimeType();
      const recorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.start(250);
      return true;
    } catch {
      return false;
    }
  }

  stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(this.blobOrNull());
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(this.blobOrNull());
      };
      recorder.onstop = finish;
      try {
        recorder.stop();
      } catch {
        finish();
      }
      window.setTimeout(finish, 1500);
    });
  }

  dispose(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* ignore */
    }
    this.recorder = null;
    this.chunks = [];
    this.disposeStream();
  }

  private blobOrNull(): Blob | null {
    if (!this.chunks.length) return null;
    const type = this.chunks[0]?.type || "audio/webm";
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    return blob.size >= 600 ? blob : null;
  }

  private disposeStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
