
from __future__ import annotations

import logging
import re
from typing import Any

from app.agents.providers.groq_client import PROMPTS_DIR, GroqClient
from app.core.config import Settings
from app.features.learning.agents.crew.models import YoutubeLessonPlanItem, YoutubeLessonPlanResult
from app.features.learning.article_catalog import build_reading_resources, is_allowed_article_url
from app.features.learning.youtube_api import search_youtube_videos
from app.features.learning.youtube_catalog import (
    ALGORITHM_VERSION,
    build_grounded_resource,
    is_allowed_youtube_url,
    normal_skill,
)

logger = logging.getLogger(__name__)
_PROMPT_PATH = PROMPTS_DIR / "learning_youtube_path_v1.txt"
_GAP_STATUSES = {"not_found", "partial_match"}
# Cap media per gap so the UI stays scannable: videos first, then reading.
_MAX_VIDEO_RESOURCES = 2
_MAX_READING_RESOURCES = 2


def tool_extract_ats_gaps(context: dict[str, Any]) -> dict[str, Any]:
    evidence = context.get("evidence_rows") or []
    gaps: list[str] = []
    seen: set[str] = set()
    for row in evidence:
        if not isinstance(row, dict):
            continue
        status = str(row.get("match_status") or "")
        if status not in _GAP_STATUSES:
            continue
        term = str(row.get("requirement_text") or "").strip()
        if not term:
            continue
        key = normal_skill(term)
        if key in seen:
            continue
        seen.add(key)
        gaps.append(term)
        if len(gaps) >= 10:
            break
    return {
        "allowed_gaps": gaps,
        "gap_count": len(gaps),
        "source_analysis_id": context.get("source_analysis_id"),
        "role_title": context.get("role_title"),
        "algorithm_version": ALGORITHM_VERSION,
    }


def _deterministic_plan(allowed_gaps: list[str]) -> YoutubeLessonPlanResult:
    items: list[YoutubeLessonPlanItem] = []
    for index, gap in enumerate(allowed_gaps, start=1):
        items.append(
            YoutubeLessonPlanItem(
                skill_gap=gap,
                title=f"Learn {gap} with guided practice",
                objective=(
                    f"Study {gap} using free video lessons and articles matched to this ATS gap, "
                    f"then practice a small project. Only claim {gap} when the experience is real."
                ),
                youtube_search_query=f"{gap} tutorial for beginners",
                article_search_query=f"{gap} tutorial guide article for beginners",
                estimated_minutes=60 if index <= 4 else 90,
                difficulty="foundational" if index <= 4 else "applied",
            )
        )
    return YoutubeLessonPlanResult(recommendations=items)


async def tool_plan_youtube_lessons(settings: Settings, context: dict[str, Any]) -> dict[str, Any]:
    allowed_gaps: list[str] = list(context.get("allowed_gaps") or [])
    if not allowed_gaps:
        return {"provider": "none", "plan": YoutubeLessonPlanResult(recommendations=[]).model_dump()}
    payload = {
        "allowed_gaps": allowed_gaps,
        "role_title": context.get("role_title"),
        "instructions": (
            "Create one learning step per allowed gap with both a youtube_search_query "
            "and an article_search_query (blogs/docs). "
            "Never invent video IDs or article URLs. Only produce search queries and learning copy."
        ),
    }
    system_prompt = (
        _PROMPT_PATH.read_text(encoding="utf-8")
        if _PROMPT_PATH.is_file()
        else (
            "Return JSON recommendations only for allowed_gaps. "
            "Never invent video IDs or article URLs. Include youtube and article search queries."
        )
    )
    if settings.groq_configured:
        try:
            result = await GroqClient(settings).generate_structured(
                system_prompt=system_prompt,
                user_payload=payload,
                schema_model=YoutubeLessonPlanResult,
                temperature=0.2,
            )
            return {"provider": "groq", "plan": result.model_dump()}
        except Exception as exc:
            logger.warning("learning youtube planner groq failed: %s", type(exc).__name__)
    return {"provider": "deterministic", "plan": _deterministic_plan(allowed_gaps).model_dump()}


def _is_safe_resource_url(url: str) -> bool:
    text = str(url or "").strip()
    return is_allowed_youtube_url(text) or is_allowed_article_url(text)


async def _resources_for_gap(
    settings: Settings,
    *,
    gap: str,
    youtube_query: str,
    article_query: str | None,
    preferred_title: str | None,
) -> list[dict[str, Any]]:
    """Materialize video + reading resources for one ATS gap (no invented deep links)."""
    videos = await search_youtube_videos(settings, query=youtube_query, gap=gap)
    video_resources = build_grounded_resource(
        gap=gap,
        search_query=youtube_query,
        preferred_title=preferred_title,
        api_videos=videos,
    )
    video_resources = [
        r for r in video_resources if is_allowed_youtube_url(str(r.get("url") or ""))
    ][:_MAX_VIDEO_RESOURCES]

    reading_resources = build_reading_resources(
        gap=gap,
        article_search_query=article_query or f"{gap} tutorial guide article",
        preferred_title=preferred_title,
    )
    reading_resources = [
        r for r in reading_resources if is_allowed_article_url(str(r.get("url") or ""))
    ][:_MAX_READING_RESOURCES]

    # Videos first (watch), then blogs/articles/docs (read).
    combined = [*video_resources, *reading_resources]
    return [r for r in combined if _is_safe_resource_url(str(r.get("url") or ""))]


def _build_item(
    *,
    gap: str,
    title: str,
    objective: str,
    difficulty: str,
    minutes: int,
    resources: list[dict[str, Any]],
    planner_provider: Any,
    settings: Settings,
    position: int,
) -> dict[str, Any]:
    kinds = [r.get("resource_type") for r in resources]
    has_video = any(
        k in {"youtube_video", "youtube_search"} for k in kinds
    )
    has_reading = any(
        k in {"article_search", "docs_search", "article", "blog"} for k in kinds
    )
    return {
        "position": position,
        "title": title[:200],
        "objective": objective[:800],
        # Keep legacy item_type for existing clients; mixed media is in resources + metadata.
        "item_type": "skill_gap",
        "difficulty": difficulty,
        "estimated_minutes": minutes,
        "metadata": {
            "source": "ats_evidence",
            "requirement": gap,
            "algorithm_version": ALGORITHM_VERSION,
            "match_status_filter": sorted(_GAP_STATUSES),
            "planner_provider": planner_provider,
            "youtube_api_configured": bool(settings.youtube_configured),
            "resource_kinds": kinds,
            "has_video_resources": has_video,
            "has_reading_resources": has_reading,
            "grounding": "ats_evidence_only",
        },
        "resources": resources,
    }


async def tool_validate_and_materialize(settings: Settings, context: dict[str, Any]) -> dict[str, Any]:
    allowed_gaps: list[str] = list(context.get("allowed_gaps") or [])
    allowed_map = {normal_skill(g): g for g in allowed_gaps}
    plan = context.get("plan") or {}
    raw_items = plan.get("recommendations") if isinstance(plan, dict) else []
    if not isinstance(raw_items, list):
        raw_items = []
    accepted: list[dict[str, Any]] = []
    rejected: list[str] = []
    used: set[str] = set()
    api_hits = 0
    reading_steps = 0
    for index, raw in enumerate(raw_items, start=1):
        if not isinstance(raw, dict):
            rejected.append(f"item_{index}:not_object")
            continue
        gap_raw = str(raw.get("skill_gap") or "").strip()
        key = normal_skill(gap_raw)
        if key not in allowed_map:
            rejected.append(f"{gap_raw or f'item_{index}'}:gap_not_in_ats_evidence")
            continue
        if key in used:
            rejected.append(f"{gap_raw}:duplicate_gap")
            continue
        gap = allowed_map[key]
        yt_query = str(raw.get("youtube_search_query") or f"{gap} tutorial").strip()
        article_query = str(raw.get("article_search_query") or "").strip() or None
        gap_tokens = {t for t in re.findall(r"[a-z0-9+#.]{2,}", normal_skill(gap))}
        query_tokens = {t for t in re.findall(r"[a-z0-9+#.]{2,}", normal_skill(yt_query))}
        if gap_tokens and not (gap_tokens & query_tokens):
            yt_query = f"{gap} tutorial for beginners"
        if article_query:
            art_tokens = {t for t in re.findall(r"[a-z0-9+#.]{2,}", normal_skill(article_query))}
            if gap_tokens and not (gap_tokens & art_tokens):
                article_query = f"{gap} tutorial guide article"
        resources = await _resources_for_gap(
            settings,
            gap=gap,
            youtube_query=yt_query,
            article_query=article_query,
            preferred_title=str(raw.get("title") or "").strip() or None,
        )
        if not resources:
            rejected.append(f"{gap}:no_safe_learning_resource")
            continue
        if any(r.get("resource_type") == "youtube_video" for r in resources):
            api_hits += 1
        if any(
            r.get("resource_type") in {"article_search", "docs_search", "article", "blog"}
            for r in resources
        ):
            reading_steps += 1
        try:
            minutes = int(raw.get("estimated_minutes") or 60)
        except (TypeError, ValueError):
            minutes = 60
        minutes = max(15, min(240, minutes))
        difficulty = str(raw.get("difficulty") or "foundational").strip().lower()
        if difficulty not in {"foundational", "applied", "advanced"}:
            difficulty = "foundational"
        objective = str(raw.get("objective") or "").strip()
        if len(objective) < 10:
            objective = (
                f"Study {gap} with the recommended video lesson(s) and article(s), "
                f"then practise a small exercise. Do not claim {gap} unless it is true experience."
            )
        accepted.append(
            _build_item(
                gap=gap,
                title=str(raw.get("title") or f"Learn {gap}").strip(),
                objective=objective,
                difficulty=difficulty,
                minutes=minutes,
                resources=resources,
                planner_provider=context.get("planner_provider"),
                settings=settings,
                position=len(accepted) + 1,
            )
        )
        used.add(key)
    for gap in allowed_gaps:
        key = normal_skill(gap)
        if key in used:
            continue
        resources = await _resources_for_gap(
            settings,
            gap=gap,
            youtube_query=f"{gap} tutorial for beginners",
            article_query=f"{gap} tutorial guide article for beginners",
            preferred_title=None,
        )
        if not resources:
            rejected.append(f"{gap}:no_safe_learning_resource")
            continue
        if any(r.get("resource_type") == "youtube_video" for r in resources):
            api_hits += 1
        if any(
            r.get("resource_type") in {"article_search", "docs_search", "article", "blog"}
            for r in resources
        ):
            reading_steps += 1
        accepted.append(
            _build_item(
                gap=gap,
                title=f"Learn {gap} with guided practice",
                objective=(
                    f"Study {gap} using the recommended video lesson(s) and article(s), then practise. "
                    f"Only claim {gap} when the experience is real."
                ),
                difficulty="foundational" if len(accepted) < 4 else "applied",
                minutes=60,
                resources=resources,
                planner_provider="validator_fill",
                settings=settings,
                position=len(accepted) + 1,
            )
        )
        used.add(key)
    accepted = accepted[:10]
    for index, item in enumerate(accepted, start=1):
        item["position"] = index
    return {
        "items": accepted,
        "rejected": rejected,
        "algorithm_version": ALGORITHM_VERSION,
        "accepted_count": len(accepted),
        "youtube_api_video_steps": api_hits,
        "reading_resource_steps": reading_steps,
        "youtube_api_configured": bool(settings.youtube_configured),
    }
