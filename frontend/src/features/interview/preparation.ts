import { apiRequest } from "@/shared/api/client";

export type PreparationQuestion = {
  question: string;
  skill: string | null;
  difficulty: "easy" | "medium" | "hard";
  source: "question_bank" | "ai" | "candidate_context";
};

export type InterviewPreparation = {
  resume_version_id: string;
  job_description_id: string;
  target_role: string;
  resume_questions: PreparationQuestion[];
  project_questions: Array<{ project_name: string; questions: PreparationQuestion[] }>;
  technical_questions: PreparationQuestion[];
  jd_questions: PreparationQuestion[];
  missing_skill_questions: PreparationQuestion[];
  coding_questions: PreparationQuestion[];
  hr_questions: PreparationQuestion[];
  study_topics: Array<{ topic: string; priority: "high" | "medium" | "low"; reason: string }>;
  interview_readiness: {
    score: number;
    ats_score: number;
    matched_skills: string[];
    missing_skills: string[];
    summary: string;
    source_analysis_id: string | null;
  };
};

export type ConfirmedResume = {
  id: string;
  title: string;
  is_active: boolean;
  latest_version?: { id: string; extraction_status?: string } | null;
};

export type ConfirmedJobDescription = {
  id: string;
  title: string;
  company?: string | null;
  role_title?: string | null;
  extraction_status: string;
};

export function createInterviewPreparation(input: {
  resume_version_id: string;
  job_description_id: string;
}) {
  return apiRequest<InterviewPreparation>("/interview-preparation", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
