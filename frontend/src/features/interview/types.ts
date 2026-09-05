export type Session = {
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

export type Question = {
  id: string;
  position: number;
  question: string;
  question_type?: string | null;
  source_context?: { provider?: string; model?: string | null; kind?: string | null } | null;
};

export type FillerAnalysis = {
  total_count?: number;
  unique?: string[];
  counts?: Record<string, number>;
  word_count?: number;
  filler_rate?: number;
  notes?: string;
};

export type SpeakingDelivery = {
  word_count?: number;
  duration_seconds?: number | null;
  words_per_minute?: number | null;
  pace_band?: string;
  pace_notes?: string;
  filler_count?: number;
  filler_rate?: number;
  filler_notes?: string;
};

export type GazeMetricsPayload = {
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

export type AnswerEvaluation = {
  verdict?: string;
  score?: number;
  interviewer_feedback?: string;
  spoken_reply?: string;
  should_follow_up?: boolean;
  follow_up_question?: string | null;
  strengths?: string[];
  improvements?: string[];
  better_approach?: string;
  filler_notes?: string;
  filler_analysis?: FillerAnalysis;
  speaking_delivery?: SpeakingDelivery;
  gaze_metrics?: GazeMetricsPayload | null;
  provider?: string;
};

export type PracticeReadiness = {
  band?: string;
  label?: string;
  composite_score?: number;
  next_step?: string;
  disclaimer?: string;
};

export type InterviewReportPayload = {
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
