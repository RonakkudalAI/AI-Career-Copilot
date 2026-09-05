const COMPLETE_PERCENT = 90;
const RANGE_JOIN_GAP = 0.35;
const MAX_RANGES = 200;

export function clampSeconds(value: unknown, cap = 86400): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(cap, number));
}

export function mergeWatchRanges(ranges: Array<number[] | unknown> | null | undefined): number[][] {
  const cleaned: number[][] = [];
  for (const pair of ranges || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const start = clampSeconds(pair[0]);
    const end = clampSeconds(pair[1]);
    if (end <= start) continue;
    cleaned.push([Math.round(start * 100) / 100, Math.round(end * 100) / 100]);
  }
  cleaned.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: number[][] = [];
  for (const [start, end] of cleaned) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1] + RANGE_JOIN_GAP) {
      merged.push([start, end]);
    } else {
      last[1] = Math.max(last[1], end);
    }
  }
  if (merged.length > MAX_RANGES) {
    const overflow = merged.slice(MAX_RANGES - 1);
    return [...merged.slice(0, MAX_RANGES - 1), [overflow[0][0], overflow[overflow.length - 1][1]]];
  }
  return merged;
}

export function uniqueWatchedSeconds(ranges: number[][] | null | undefined): number {
  return Math.round(mergeWatchRanges(ranges).reduce((sum, [start, end]) => sum + (end - start), 0) * 100) / 100;
}

export function watchPercentFromSeconds(watchedSeconds: number, durationSeconds: number | null | undefined): number {
  const duration = clampSeconds(durationSeconds);
  if (duration <= 0) return 0;
  const watched = Math.max(0, Math.min(duration, clampSeconds(watchedSeconds)));
  return Math.max(0, Math.min(100, Math.round((watched / duration) * 100)));
}

export function extractYoutubeVideoId(url: string | null | undefined, metadataVideoId?: string | null): string | null {
  const fromMeta = String(metadataVideoId || "").trim();
  if (/^[\w-]{6,}$/.test(fromMeta)) return fromMeta;
  const text = String(url || "").trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = parsed.searchParams.get("v") || "";
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatClock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(clampSeconds(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function isExactVideo(resource: {
  resource_type?: string | null;
  url?: string | null;
  metadata?: { video_id?: string | null } | null;
}): boolean {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  if (extractYoutubeVideoId(url, resource.metadata?.video_id)) return true;
  return type === "youtube_video" || type === "video" || /youtube\.com\/watch\?v=|youtu\.be\//i.test(url);
}

export function isVideoResource(resource: { resource_type?: string | null; url?: string | null }): boolean {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  return type.includes("youtube") || type.includes("video") || /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
}

export function isArticleResource(resource: { resource_type?: string | null; url?: string | null }): boolean {
  const type = (resource.resource_type || "").toLowerCase();
  const url = resource.url || "";
  if (isVideoResource(resource)) return false;
  return (
    type.includes("article") ||
    type.includes("blog") ||
    type.includes("docs") ||
    type.includes("reading") ||
    /developer\.mozilla\.org|freecodecamp\.org|dev\.to|css-tricks\.com|realpython\.com|docs\.|learn\.microsoft|medium\.com|digitalocean\.com/i.test(
      url,
    ) ||
    (/google\.com\/search|duckduckgo\.com/i.test(url) && /site:|article|guide|tutorial|docs/i.test(url))
  );
}

export function resourceWatchPercent(resource: {
  watch_status?: string | null;
  watch_percent?: number | null;
  duration_seconds?: number | null;
  watched_seconds?: number | null;
  opened_at?: string | null;
  resource_type?: string | null;
  url?: string | null;
  metadata?: { video_id?: string | null } | null;
}): number {
  if (resource.watch_status === "completed") return 100;
  const stored = Number(resource.watch_percent);
  if (Number.isFinite(stored) && stored > 0) return Math.max(0, Math.min(100, Math.round(stored)));
  const fromTime = watchPercentFromSeconds(Number(resource.watched_seconds || 0), resource.duration_seconds);
  if (fromTime > 0) return fromTime;
  if (resource.opened_at && !isExactVideo(resource)) return 50;
  return 0;
}

export function itemWatchPercent(item: {
  status?: string;
  watch_percent?: number | null;
  learning_resources?: Array<{
    watch_status?: string | null;
    watch_percent?: number | null;
    duration_seconds?: number | null;
    watched_seconds?: number | null;
    opened_at?: string | null;
    resource_type?: string | null;
    url?: string | null;
    metadata?: { video_id?: string | null } | null;
  }>;
}): number {
  const resources = item.learning_resources || [];
  if (resources.length) {
    return Math.round(resources.reduce((sum, resource) => sum + resourceWatchPercent(resource), 0) / resources.length);
  }
  const stored = Number(item.watch_percent);
  if (Number.isFinite(stored) && stored > 0) return Math.max(0, Math.min(100, Math.round(stored)));
  if (item.status === "completed") return 100;
  if (item.status === "in_progress") return 50;
  return 0;
}

export function applyHeartbeat(
  ranges: number[][] | null | undefined,
  nextRange: number[] | null,
  currentTime: number,
  duration: number | null,
): {
  watched_ranges: number[][];
  watched_seconds: number;
  watch_percent: number;
  position_seconds: number;
  duration_seconds: number | null;
  watch_status: "not_started" | "in_progress" | "completed";
} {
  const merged = mergeWatchRanges([...(ranges || []), ...(nextRange ? [nextRange] : [])]);
  const durationSeconds = duration && duration > 0 ? duration : null;
  const watched = uniqueWatchedSeconds(merged);
  const percent = watchPercentFromSeconds(watched, durationSeconds);
  const complete = durationSeconds != null && percent >= COMPLETE_PERCENT;
  return {
    watched_ranges: merged,
    watched_seconds: watched,
    watch_percent: complete ? 100 : percent,
    position_seconds: clampSeconds(currentTime),
    duration_seconds: durationSeconds,
    watch_status: complete ? "completed" : percent > 0 || currentTime > 0 ? "in_progress" : "not_started",
  };
}
