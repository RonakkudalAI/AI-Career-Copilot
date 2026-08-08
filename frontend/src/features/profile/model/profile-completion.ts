

export type ProfileMissingItem = {
  key: string;
  label: string;
  points?: number;
  href?: string;
  group?: string;
};

export type ProfileCompletionDetails = {
  missing?: ProfileMissingItem[];
  completed?: ProfileMissingItem[];
  total?: number;
  missing_count?: number;
  completed_points?: number;
  missing_points?: number;
};

export const PROFILE_UPDATED_EVENT = "career-copilot:profile-updated";

export type ProfileUpdatedDetail = {
  profile_completion?: number;
  profile_missing?: ProfileMissingItem[];
  profile_completion_details?: ProfileCompletionDetails | null;
};

const RETIRED_MISSING_KEYS = new Set(["resume"]);

export function notifyProfileUpdated(detail?: ProfileUpdatedDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: detail || {} }));
  } catch {
    void 0;
  }
}

export function extractMissing(
  details?: ProfileCompletionDetails | null,
  fallback?: ProfileMissingItem[] | null,
): ProfileMissingItem[] {
  const fromDetails = Array.isArray(details?.missing) ? details!.missing! : [];
  const fromFallback = Array.isArray(fallback) ? fallback : [];
  const raw = fromDetails.length > 0 ? fromDetails : fromFallback;
  return raw.filter(
    (item): item is ProfileMissingItem =>
      Boolean(item && item.label && item.key) && !RETIRED_MISSING_KEYS.has(String(item.key)),
  );
}

export function clampCompletion(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function resolveCompletion(
  stored: unknown,
  details?: ProfileCompletionDetails | null,
  missing?: ProfileMissingItem[] | null,
): number {
  if (details && typeof details.total === "number" && Number.isFinite(details.total)) {
    return clampCompletion(details.total);
  }
  if (details && typeof details.completed_points === "number" && Number.isFinite(details.completed_points)) {
    return clampCompletion(details.completed_points);
  }

  const list = extractMissing(details, missing);
  if (list.length > 0 && list.every((m) => typeof m.points === "number")) {
    const missingPts = list.reduce((sum, m) => sum + (Number(m.points) || 0), 0);
    if (missingPts >= 0 && missingPts <= 100) {
      const derived = clampCompletion(100 - missingPts);
      const fromStored = clampCompletion(stored);

      if (fromStored === 0 && derived > 0) return derived;
      if (Math.abs(fromStored + missingPts - 100) <= 1) return fromStored;
      return derived;
    }
  }

  return clampCompletion(stored);
}

export function applyLiveCompletionDetail(detail: ProfileUpdatedDetail | undefined): {
  completion: number;
  missing: ProfileMissingItem[];
} | null {
  if (
    !detail ||
    (detail.profile_completion == null &&
      !detail.profile_missing &&
      !detail.profile_completion_details)
  ) {
    return null;
  }
  const details = detail.profile_completion_details;
  const missing = extractMissing(details, detail.profile_missing);
  const completion = resolveCompletion(detail.profile_completion, details, missing);
  return { completion, missing };
}
