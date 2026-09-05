export type WatchStatus = "not_started" | "in_progress" | "completed";

export type Resource = {
  id: string;
  title: string;
  resource_type?: string | null;
  provider?: string | null;
  url?: string | null;
  reason_recommended?: string | null;
  watch_status?: WatchStatus | null;
  position_seconds?: number | null;
  duration_seconds?: number | null;
  watched_seconds?: number | null;
  watch_percent?: number | null;
  watched_ranges?: number[][] | null;
  opened_at?: string | null;
  completed_at?: string | null;
  last_watched_at?: string | null;
  metadata?: {
    video_id?: string;
    channel_title?: string;
    thumbnail_url?: string;
    search_query?: string;
    video_id_policy?: string;
    source?: string;
    requirement?: string;
  } | null;
};

export type LearningItem = {
  id: string;
  title: string;
  objective?: string | null;
  status: "pending" | "in_progress" | "completed";
  estimated_minutes?: number | null;
  difficulty?: string | null;
  watch_percent?: number | null;
  position?: number | null;
  metadata?: {
    requirement?: string;
    source?: string;
  } | null;
  learning_resources?: Resource[];
};

export type WatchSummary = {
  resource_count?: number;
  completed_resources?: number;
  watched_percent?: number;
  last_watched_at?: string | null;
  last_resource_id?: string | null;
  last_resource_title?: string | null;
  last_item_id?: string | null;
};

export type SourceSnapshot = {
  analysis_id?: string;
  overall_score?: number | null;
  status?: string | null;
  resume_title?: string | null;
  job_title?: string | null;
  company?: string | null;
  role_title?: string | null;
  missing_count?: number | null;
  partial_count?: number | null;
  completed_at?: string | null;
};

export type Path = {
  id: string;
  title: string;
  description?: string | null;
  progress_percentage: number;
  status: string;
  item_count?: number;
  items?: LearningItem[];
  algorithm_version?: string;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot?: SourceSnapshot | null;
  watch_summary?: WatchSummary | null;
  grounding?: { policy?: string; source?: string; analysis_id?: string };
};

export type AtsAnalysis = {
  id: string;
  status: string;
  overall_score: number | null;
  created_at?: string;
  completed_at?: string;
  summary?: {
    missing?: number;
    matched?: number;
    total?: number;
    missing_terms?: string[];
    partial_terms?: string[];
  };
  score_breakdown?: {
    missing_terms?: string[];
    partial_terms?: string[];
    matched_terms?: string[];
  };
  resume?: { title?: string | null } | null;
  job_description?: {
    title?: string | null;
    company?: string | null;
    role_title?: string | null;
  } | null;
};

export type ResourceProgressResponse = Resource & {
  item_status?: LearningItem["status"];
  item_watch_percent?: number;
  progress_percentage?: number;
  watch_summary?: WatchSummary;
};
