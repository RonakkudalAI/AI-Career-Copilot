export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  work_mode?: string | null;
  description?: string | null;
  requirements?: string[];
  application_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  published_at?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
};

export type Recommendation = {
  id: string;
  job: Job;
  match_score: number;
  match_breakdown?: {
    matched_requirements?: string[];
    missing_requirements?: string[];
  };
  evidence?: { note?: string };
};
