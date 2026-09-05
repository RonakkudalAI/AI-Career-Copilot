export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  work_mode?: string | null;
  description?: string | null;
  requirements?: string[];
  application_url?: string | null;
  published_at?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  source?: string | null;
  application_count?: number | null;
};

export type PublicProfileResult = {
  username: string;
  full_name?: string | null;
  headline?: string | null;
  current_role?: string | null;
  career_level?: string | null;
  location?: string | null;
};

export type SavedJobStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "dismissed";

/** Statuses the candidate actively tracks in their pipeline (excludes dismissed). */
export const PIPELINE_STATUSES: SavedJobStatus[] = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
];

export type SavedJobRow = {
  job_id?: string;
  status?: SavedJobStatus | string;
  notes?: string | null;
  saved_at?: string | null;
  updated_at?: string | null;
  jobs?: Job | null;
};

export type Recommendation = {
  id: string;
  job: Job;
  match_score: number;
  match_breakdown?: {
    matched_requirements?: string[];
    missing_requirements?: string[];
    verdict?: "strong_fit" | "possible_fit" | "stretch" | "not_a_fit";
    rationale?: string;
  };
  evidence?: { note?: string; method?: string; provider?: string | null; agent?: string };
};

export function isPipelineStatus(status: string | undefined | null): boolean {
  const value = (status || "saved").toLowerCase();
  return PIPELINE_STATUSES.includes(value as SavedJobStatus);
}

export function statusLabel(status: string | undefined | null): string {
  const value = (status || "saved").replaceAll("_", " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function statusTone(status: string | undefined | null): "success" | "warning" | "danger" | "info" {
  switch ((status || "saved").toLowerCase()) {
    case "applied":
    case "interviewing":
    case "offer":
      return "success";
    case "rejected":
    case "withdrawn":
      return "danger";
    case "dismissed":
      return "warning";
    default:
      return "info";
  }
}
