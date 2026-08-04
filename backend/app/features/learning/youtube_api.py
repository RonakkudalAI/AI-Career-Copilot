"""YouTube Data API v3 client for real video recommendations.

Anti-hallucination policy:
  - Video IDs come only from Google's API response.
  - Never invent or hardcode watch IDs.
  - If the API is unavailable, callers must fall back to search URLs (not fake videos).
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

_VIDEO_ID_RE = re.compile(r"^[\w-]{6,}$")


def youtube_watch_url(video_id: str) -> str:
    cleaned = (video_id or "").strip()
    if not _VIDEO_ID_RE.fullmatch(cleaned):
        raise ValueError("invalid youtube video id")
    return f"https://www.youtube.com/watch?v={cleaned}"


def _clean_query(query: str, gap: str) -> str:
    text = re.sub(r"\s+", " ", (query or "").strip())
    gap_clean = re.sub(r"\s+", " ", (gap or "").strip())
    if not text:
        text = f"{gap_clean} tutorial for beginners"
    # Keep the gap terms in the query so results stay on-topic.
    gap_tokens = {t for t in re.findall(r"[a-z0-9+#.]{2,}", gap_clean.casefold())}
    query_tokens = {t for t in re.findall(r"[a-z0-9+#.]{2,}", text.casefold())}
    if gap_tokens and not (gap_tokens & query_tokens):
        text = f"{gap_clean} {text}"
    # Prefer free educational material without inventing channels.
    if "tutorial" not in text.casefold() and "course" not in text.casefold():
        text = f"{text} tutorial"
    return text[:180]


async def search_youtube_videos(
    settings: Settings,
    *,
    query: str,
    gap: str,
    max_results: int | None = None,
) -> list[dict[str, Any]]:
    """
    Search YouTube for real videos matching the ATS skill gap.

    Returns only API-verified items:
      video_id, title, channel_title, url, thumbnail_url, description_snippet
    """
    if not settings.youtube_configured:
        return []

    limit = max_results if max_results is not None else settings.youtube_search_max_results
    limit = max(1, min(5, int(limit)))
    cleaned = _clean_query(query, gap)
    params = {
        "part": "snippet",
        "type": "video",
        "maxResults": str(limit),
        "q": cleaned,
        "safeSearch": "strict",
        "relevanceLanguage": "en",
        "videoEmbeddable": "true",
        "key": settings.youtube_api_key,
    }
    url = f"{settings.youtube_api_base_url.rstrip('/')}/search?{urlencode(params)}"

    try:
        timeout = httpx.Timeout(settings.youtube_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        logger.warning("youtube_api_network_error error=%s", type(exc).__name__)
        return []

    if response.status_code == 403:
        logger.warning("youtube_api_forbidden status=403 (check key/quota)")
        return []
    if response.status_code == 429:
        logger.warning("youtube_api_rate_limited status=429")
        return []
    if response.status_code >= 400:
        logger.warning("youtube_api_error status=%s", response.status_code)
        return []

    try:
        body = response.json()
    except ValueError:
        logger.warning("youtube_api_invalid_json")
        return []

    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list):
        return []

    videos: list[dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        id_obj = raw.get("id") if isinstance(raw.get("id"), dict) else {}
        video_id = str(id_obj.get("videoId") or "").strip()
        if not _VIDEO_ID_RE.fullmatch(video_id):
            continue
        snippet = raw.get("snippet") if isinstance(raw.get("snippet"), dict) else {}
        title = str(snippet.get("title") or "").strip()
        if not title:
            continue
        channel = str(snippet.get("channelTitle") or "YouTube").strip() or "YouTube"
        thumbs = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
        thumb = ""
        for key in ("medium", "high", "default"):
            entry = thumbs.get(key) if isinstance(thumbs.get(key), dict) else None
            if entry and entry.get("url"):
                thumb = str(entry["url"])
                break
        description = str(snippet.get("description") or "").strip()[:400]
        try:
            watch = youtube_watch_url(video_id)
        except ValueError:
            continue
        videos.append(
            {
                "video_id": video_id,
                "title": title[:200],
                "channel_title": channel[:160],
                "url": watch,
                "thumbnail_url": thumb,
                "description_snippet": description,
                "search_query": cleaned,
            }
        )
    return videos
