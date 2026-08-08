import type { Job, Recommendation, SavedJobStatus } from "./components/job-types";

const PREFIX = "career_copilot_job_recs_v1:";
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes stale-while-revalidate

export type JobRecsCachePayload = {
  recommendations: Recommendation[];
  jobs: Job[];
  statusByJobId: Record<string, SavedJobStatus>;
  savedAt: number;
};

export function jobRecsCacheKey(parts: {
  demo: boolean;
  location: string;
  workMode: string;
  salaryMin: number | "" | null;
}): string {
  return (
    PREFIX +
    [
      parts.demo ? "demo" : "user",
      parts.location.trim().toLowerCase(),
      parts.workMode.trim().toLowerCase(),
      parts.salaryMin === "" || parts.salaryMin == null ? "" : String(parts.salaryMin),
    ].join("|")
  );
}

export function readJobRecsCache(key: string): JobRecsCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JobRecsCachePayload;
    if (!parsed || !Array.isArray(parsed.recommendations) || !Array.isArray(parsed.jobs)) {
      return null;
    }
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeJobRecsCache(key: string, payload: Omit<JobRecsCachePayload, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const body: JobRecsCachePayload = { ...payload, savedAt: Date.now() };
    window.sessionStorage.setItem(key, JSON.stringify(body));
  } catch {
    // Quota / private mode — ignore; live fetch still works.
  }
}
