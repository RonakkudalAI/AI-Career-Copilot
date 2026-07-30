export type CandidateProfile = {
  id: string;
  full_name: string;
  headline: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  current_role: string | null;
  years_experience: number | null;
  career_level: string | null;
  career_goal: string | null;
  profile_completion: number;
  profile_completion_details: Record<string, number>;
};

export type ApiFailure = {
  error: { code: string; message: string; details: unknown; request_id: string };
};

export type CapabilityFlags = {
  ats_scoring: boolean;
  interview_evaluation: boolean;
  job_recommendations: boolean;
};
