import type { AnswerEvaluation, GazeMetricsPayload, Question, Session, SpeakingDelivery } from "@/features/interview/types";
import { buildLiveQuestions } from "@/features/interview/live-bank";

export const LIVE_SESSION_PREFIX = "local-";
const STORAGE_KEY = "career-copilot-live-interview";

export type LiveSetup = {
  mode: string;
  target_role: string | null;
  difficulty: string;
  question_count: number;
  camera_enabled: boolean;
  microphone_enabled: boolean;
  job_description_text: string | null;
  resume_version_id: string | null;
  job_description_id: string | null;
};

export type LiveResponse = {
  questionId: string;
  position: number;
  typed_response: string;
  transcript: string;
  duration_seconds: number;
  speech_metrics: SpeakingDelivery | Record<string, unknown> | null;
  gaze_metrics: GazeMetricsPayload | null;
  evaluation: AnswerEvaluation;
};

export type LiveInterview = {
  id: string;
  createdAt: string;
  setup: LiveSetup;
  questions: Question[];
  responses: LiveResponse[];
};

export function isLiveSessionId(id: string): boolean {
  return id.startsWith(LIVE_SESSION_PREFIX);
}

export function createLiveInterview(setup: LiveSetup): LiveInterview {
  const id = `${LIVE_SESSION_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    createdAt: new Date().toISOString(),
    setup,
    questions: buildLiveQuestions({
      mode: setup.mode,
      count: setup.question_count,
      targetRole: setup.target_role,
    }),
    responses: [],
  };
}

export function liveToSession(live: LiveInterview): Session {
  return {
    id: live.id,
    mode: live.setup.mode,
    status: "in_progress",
    created_at: live.createdAt,
    question_count: live.setup.question_count,
    target_role: live.setup.target_role,
    camera_enabled: live.setup.camera_enabled,
    microphone_enabled: live.setup.microphone_enabled,
  };
}

export function loadLiveInterview(): LiveInterview | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveInterview;
    if (!parsed?.id || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLiveInterview(live: LiveInterview): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(live));
}

export function clearLiveInterview(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function writeLiveInterview(mutate: (current: LiveInterview) => LiveInterview): LiveInterview | null {
  const current = loadLiveInterview();
  if (!current) return null;
  const next = mutate(current);
  saveLiveInterview(next);
  return next;
}
