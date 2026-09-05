"""Accurate learning watch progress.

Progress is computed from what the candidate actually opened or watched, not
from a manual step checkbox. Video lessons merge unique playback ranges so
skipping ahead does not count as watched time.
"""

from __future__ import annotations

from typing import Any

COMPLETE_PERCENT = 90
MAX_RANGES = 200
RANGE_JOIN_GAP = 0.35
MAX_SECONDS = 86400.0


def empty_watch_fields() -> dict[str, Any]:
    return {
        "watch_status": "not_started",
        "position_seconds": 0.0,
        "duration_seconds": None,
        "watched_seconds": 0.0,
        "watch_percent": 0,
        "watched_ranges": [],
        "opened_at": None,
        "completed_at": None,
        "last_watched_at": None,
    }


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return number


def clamp_seconds(value: Any, *, cap: float = MAX_SECONDS) -> float:
    return max(0.0, min(cap, _as_float(value, 0.0)))


def merge_watch_ranges(ranges: list[Any] | None) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for pair in ranges or []:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        start = clamp_seconds(pair[0])
        end = clamp_seconds(pair[1])
        if end <= start:
            continue
        cleaned.append([round(start, 2), round(end, 2)])
    cleaned.sort(key=lambda row: (row[0], row[1]))
    merged: list[list[float]] = []
    for start, end in cleaned:
        if not merged or start > merged[-1][1] + RANGE_JOIN_GAP:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    if len(merged) > MAX_RANGES:
        # Keep coverage, drop the oldest/smallest fragments by merging greedily.
        overflow = merged[MAX_RANGES - 1 :]
        merged = merged[: MAX_RANGES - 1]
        merged.append([overflow[0][0], overflow[-1][1]])
    return merged


def unique_watched_seconds(ranges: list[Any] | None) -> float:
    return round(sum(end - start for start, end in merge_watch_ranges(ranges)), 2)


def percent_from_seconds(watched_seconds: float, duration_seconds: float | None) -> int:
    duration = _as_float(duration_seconds, 0.0)
    if duration <= 0:
        return 0
    watched = max(0.0, min(duration, _as_float(watched_seconds, 0.0)))
    return int(max(0, min(100, round((watched / duration) * 100))))


def is_video_resource(resource: dict[str, Any] | None) -> bool:
    row = resource or {}
    kind = str(row.get("resource_type") or "").lower()
    url = str(row.get("url") or "")
    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    video_id = str(meta.get("video_id") or "").strip()
    if video_id:
        return True
    if "youtube" in kind or kind == "video":
        return True
    return "youtube.com/watch" in url or "youtu.be/" in url


def is_exact_video_resource(resource: dict[str, Any] | None) -> bool:
    row = resource or {}
    kind = str(row.get("resource_type") or "").lower()
    url = str(row.get("url") or "")
    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    if str(meta.get("video_id") or "").strip():
        return True
    return kind in {"youtube_video", "video"} or "youtube.com/watch" in url or "youtu.be/" in url


def resource_percent(resource: dict[str, Any] | None) -> int:
    row = resource or {}
    status = str(row.get("watch_status") or "").lower()
    if status == "completed":
        return 100
    stored = row.get("watch_percent")
    if isinstance(stored, (int, float)) and stored == stored:
        value = int(max(0, min(100, round(float(stored)))))
        if value:
            return value
    duration = _as_float(row.get("duration_seconds"), 0.0)
    watched = _as_float(row.get("watched_seconds"), 0.0)
    if duration > 0:
        return percent_from_seconds(watched, duration)
    if row.get("opened_at") and not is_exact_video_resource(row):
        return 50
    return 0


def item_status_from_percent(percent: int) -> str:
    if percent >= COMPLETE_PERCENT:
        return "completed"
    if percent > 0:
        return "in_progress"
    return "pending"


def item_percent(item: dict[str, Any] | None) -> int:
    row = item or {}
    resources = row.get("learning_resources") if isinstance(row.get("learning_resources"), list) else []
    if resources:
        return int(round(sum(resource_percent(resource) for resource in resources) / len(resources)))
    status = str(row.get("status") or "pending")
    if status == "completed":
        return 100
    if status == "in_progress":
        return 50
    return 0


def apply_watch_patch(
    resource: dict[str, Any],
    patch: dict[str, Any],
    *,
    now: str,
) -> dict[str, Any]:
    """Merge a client heartbeat into stored watch fields."""
    next_row = {**empty_watch_fields(), **(resource or {})}
    incoming_ranges = patch.get("watched_ranges")
    existing_ranges = next_row.get("watched_ranges") or []
    if incoming_ranges:
        next_row["watched_ranges"] = merge_watch_ranges(list(existing_ranges) + list(incoming_ranges))
        next_row["watched_seconds"] = unique_watched_seconds(next_row["watched_ranges"])
    else:
        next_row["watched_ranges"] = merge_watch_ranges(existing_ranges)
        if next_row.get("watched_seconds") in (None, ""):
            next_row["watched_seconds"] = unique_watched_seconds(next_row["watched_ranges"])

    if patch.get("position_seconds") is not None:
        next_row["position_seconds"] = round(clamp_seconds(patch.get("position_seconds")), 2)
    if patch.get("duration_seconds") is not None:
        next_row["duration_seconds"] = round(clamp_seconds(patch.get("duration_seconds")), 2) or None

    duration = _as_float(next_row.get("duration_seconds"), 0.0)
    watched = _as_float(next_row.get("watched_seconds"), 0.0)
    if duration > 0:
        watched = min(watched, duration)
        next_row["watched_seconds"] = round(watched, 2)
        # Drop ranges that extend past the known duration.
        next_row["watched_ranges"] = merge_watch_ranges(
            [[start, min(end, duration)] for start, end in next_row["watched_ranges"]]
        )
        percent = percent_from_seconds(watched, duration)
    else:
        percent = int(next_row.get("watch_percent") or 0)

    opened = bool(patch.get("opened"))
    if opened:
        next_row["opened_at"] = next_row.get("opened_at") or now
        if not is_exact_video_resource(next_row) and percent < 50:
            percent = 50

    explicit = str(patch.get("status") or "").strip().lower() or None
    position = _as_float(next_row.get("position_seconds"), 0.0)
    auto_complete = duration > 0 and percent >= COMPLETE_PERCENT

    if explicit == "completed" or auto_complete:
        next_row["watch_status"] = "completed"
        next_row["watch_percent"] = 100
        next_row["completed_at"] = next_row.get("completed_at") or now
        if duration > 0 and watched < duration * 0.9:
            # Explicit complete (article / search lesson) — keep honest unique time.
            next_row["watch_percent"] = 100
    elif explicit == "not_started":
        next_row["watch_status"] = "not_started"
        next_row["watch_percent"] = 0
        next_row["position_seconds"] = 0.0
        next_row["watched_seconds"] = 0.0
        next_row["watched_ranges"] = []
        next_row["completed_at"] = None
        next_row["opened_at"] = None
    else:
        if percent > 0 or next_row.get("opened_at") or position > 0:
            next_row["watch_status"] = "in_progress"
        else:
            next_row["watch_status"] = "not_started"
        next_row["watch_percent"] = percent
        if next_row["watch_status"] != "completed":
            next_row["completed_at"] = None

    next_row["last_watched_at"] = now
    return next_row


def with_watch_defaults(resource: dict[str, Any] | None) -> dict[str, Any]:
    row = {**empty_watch_fields(), **(resource or {})}
    row["watched_ranges"] = merge_watch_ranges(row.get("watched_ranges") or [])
    row["watch_percent"] = resource_percent(row)
    return row


def complete_resource(resource: dict[str, Any], *, now: str) -> dict[str, Any]:
    row = with_watch_defaults(resource)
    row["watch_status"] = "completed"
    row["watch_percent"] = 100
    row["completed_at"] = row.get("completed_at") or now
    row["last_watched_at"] = now
    row["opened_at"] = row.get("opened_at") or now
    return row


def path_rollup(items: list[dict[str, Any]]) -> dict[str, Any]:
    percents = [item_percent(item) for item in items]
    percent = int(round(sum(percents) / len(percents))) if percents else 0
    resources: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for item in items:
        for resource in item.get("learning_resources") or []:
            if isinstance(resource, dict):
                resources.append((item, resource))
    completed_resources = sum(1 for _item, resource in resources if resource_percent(resource) >= COMPLETE_PERCENT)
    last_item_id = None
    last_resource: dict[str, Any] | None = None
    latest = ""
    for item, resource in resources:
        stamp = str(resource.get("last_watched_at") or "")
        if stamp > latest:
            latest = stamp
            last_resource = resource
            last_item_id = item.get("id")
    return {
        "progress_percentage": percent,
        "status": "completed" if percent == 100 and items else "active",
        "watch_summary": {
            "resource_count": len(resources),
            "completed_resources": completed_resources,
            "watched_percent": percent,
            "last_watched_at": last_resource.get("last_watched_at") if last_resource else None,
            "last_resource_id": last_resource.get("id") if last_resource else None,
            "last_resource_title": last_resource.get("title") if last_resource else None,
            "last_item_id": last_item_id,
        },
    }


def watch_fields_for_write(resource: dict[str, Any]) -> dict[str, Any]:
    """Subset persisted on learning_resources."""
    row = with_watch_defaults(resource)
    return {
        "watch_status": row.get("watch_status") or "not_started",
        "position_seconds": row.get("position_seconds") or 0.0,
        "duration_seconds": row.get("duration_seconds"),
        "watched_seconds": row.get("watched_seconds") or 0.0,
        "watch_percent": int(row.get("watch_percent") or 0),
        "watched_ranges": row.get("watched_ranges") or [],
        "opened_at": row.get("opened_at"),
        "completed_at": row.get("completed_at"),
        "last_watched_at": row.get("last_watched_at"),
    }


def build_ats_source_snapshot(
    *,
    analysis: dict[str, Any],
    resume: dict[str, Any] | None,
    job: dict[str, Any] | None,
    evidence_rows: list[dict[str, Any]],
    role_title: str | None,
) -> dict[str, Any]:
    missing = 0
    partial = 0
    for row in evidence_rows:
        status = str(row.get("match_status") or "")
        if status == "not_found":
            missing += 1
        elif status == "partial_match":
            partial += 1
    summary = analysis.get("summary") if isinstance(analysis.get("summary"), dict) else {}
    return {
        "analysis_id": str(analysis.get("id") or ""),
        "overall_score": analysis.get("overall_score"),
        "status": analysis.get("status"),
        "resume_title": (resume or {}).get("title"),
        "job_title": (job or {}).get("title"),
        "company": (job or {}).get("company"),
        "role_title": role_title or (job or {}).get("role_title") or (job or {}).get("title"),
        "missing_count": int(summary.get("missing") or missing),
        "partial_count": int(summary.get("partial") or partial),
        "completed_at": analysis.get("completed_at") or analysis.get("created_at"),
    }
