
from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus, urlparse

ALGORITHM_VERSION = "ats-youtube-api-v1"
_YOUTUBE_HOSTS = {
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
}
def normal_skill(value: str) -> str:
    text = value.lower().replace(".js", " js ").strip()
    text = re.sub(r"\s+", " ", text)
    return text
def youtube_search_url(query: str) -> str:
    cleaned = re.sub(r"\s+", " ", (query or "").strip())
    if not cleaned:
        raise ValueError("empty youtube search query")
    return f"https://www.youtube.com/results?search_query={quote_plus(cleaned)}"
def is_allowed_youtube_url(url: str) -> bool:
    text = (url or "").strip()
    if not text.startswith("https://"):
        return False
    try:
        parsed = urlparse(text)
    except Exception:
        return False
    host = (parsed.netloc or "").lower()
    if host not in _YOUTUBE_HOSTS:
        return False
    path = parsed.path or ""
    if host == "youtu.be":
        return bool(re.fullmatch(r"/[\w-]{6,}", path))
    if path.startswith("/results"):
        return "search_query=" in (parsed.query or "")
    if path.startswith("/watch"):
        return "v=" in (parsed.query or "")
    if path.startswith("/playlist"):
        return "list=" in (parsed.query or "")
    return False
def build_api_video_resource(
    *,
    gap: str,
    video: dict[str, Any],
) -> dict[str, Any]:
    video_id = str(video.get("video_id") or "").strip()
    url = str(video.get("url") or "").strip()
    title = str(video.get("title") or "").strip() or f"YouTube lesson for {gap}"
    channel = str(video.get("channel_title") or "YouTube").strip() or "YouTube"
    if not is_allowed_youtube_url(url) or "/watch" not in url:
        raise ValueError("api video missing valid watch url")
    return {
        "title": title[:200],
        "resource_type": "youtube_video",
        "provider": channel[:160],
        "url": url,
        "reason_recommended": (
            f"Free lesson matched to ATS gap '{gap}'. "
            "Only claim this skill on your resume when the experience is real."
        ),
        "metadata": {
            "source": "youtube_data_api_v3",
            "requirement": gap,
            "video_id": video_id,
            "channel_title": channel,
            "thumbnail_url": str(video.get("thumbnail_url") or "")[:500],
            "description_snippet": str(video.get("description_snippet") or "")[:400],
            "search_query": str(video.get("search_query") or ""),
            "algorithm_version": ALGORITHM_VERSION,
            "grounding": "ats_evidence_only",
            "video_id_policy": "youtube_api_only_no_invented_ids",
        },
    }
def build_search_fallback_resource(
    *,
    gap: str,
    search_query: str | None = None,
    preferred_title: str | None = None,
    reason: str = "youtube_api_unavailable",
) -> dict[str, Any]:
    base_query = (search_query or "").strip()
    if normal_skill(gap) not in normal_skill(base_query):
        base_query = f"{gap} tutorial for beginners"
    url = youtube_search_url(base_query)
    return {
        "title": preferred_title or f"Lesson search: {gap}",
        "resource_type": "youtube_search",
        "provider": "YouTube",
        "url": url,
        "reason_recommended": (
            f"Lesson search for ATS gap '{gap}'. "
            "Open results and pick a reputable free tutorial — no video IDs are invented."
        ),
        "metadata": {
            "source": "youtube_search_fallback",
            "requirement": gap,
            "search_query": base_query,
            "algorithm_version": ALGORITHM_VERSION,
            "grounding": "ats_evidence_only",
            "video_id_policy": "search_only_no_invented_ids",
            "fallback_reason": reason,
        },
    }
def build_grounded_resource(
    *,
    gap: str,
    search_query: str | None,
    preferred_title: str | None = None,
    api_videos: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []
    for video in api_videos or []:
        try:
            resources.append(build_api_video_resource(gap=gap, video=video))
        except ValueError:
            continue
    if resources:
        return resources
    return [
        build_search_fallback_resource(
            gap=gap,
            search_query=search_query,
            preferred_title=preferred_title,
            reason="no_api_results" if api_videos is not None else "youtube_api_not_configured",
        )
    ]
