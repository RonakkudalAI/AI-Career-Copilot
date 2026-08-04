"""Sequential CrewAI-compatible learning crew: ATS gaps → YouTube plan → validate."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.features.learning.agents.crew.tools import (
    tool_extract_ats_gaps,
    tool_plan_youtube_lessons,
    tool_validate_and_materialize,
)
from app.features.learning.youtube_catalog import ALGORITHM_VERSION
from app.features.resume_improvement.agents.crew.compat import crew_runtime_mode, official_crewai_installed, try_import_crewai
from app.features.resume_improvement.agents.crew.models import CrewAgent, CrewRunResult, CrewTask, CrewTaskResult

logger = logging.getLogger(__name__)

GAP_ANALYST = CrewAgent(
    role="ATS Gap Analyst",
    goal="List skill/requirement gaps already present in completed ATS evidence only.",
    backstory=(
        "You only read ATS evidence rows. You never invent missing skills or job requirements."
    ),
)

YOUTUBE_PLANNER = CrewAgent(
    role="YouTube Curriculum Planner",
    goal="Turn each allowed ATS gap into a YouTube study step without inventing video IDs.",
    backstory=(
        "You plan free YouTube learning steps. You never invent watch URLs or video IDs. "
        "You only use allowed gaps from the analyst."
    ),
)

RESOURCE_VALIDATOR = CrewAgent(
    role="Learning Resource Validator",
    goal="Drop any recommendation outside ATS gaps and materialize only safe YouTube URLs.",
    backstory="You are a deterministic gate. Hallucinated gaps or non-YouTube links are rejected.",
)

LEARNING_CREW_TASKS = [
    CrewTask(
        name="extract_ats_gaps",
        description="Extract unique not_found/partial_match requirements from ATS evidence.",
        agent=GAP_ANALYST,
        expected_output="JSON allowed_gaps list",
        tool_name="extract_ats_gaps",
    ),
    CrewTask(
        name="plan_youtube_lessons",
        description="LLM (or deterministic) plan: one YouTube study step per allowed gap.",
        agent=YOUTUBE_PLANNER,
        expected_output="YoutubeLessonPlanResult JSON without video IDs",
        tool_name="plan_youtube_lessons",
    ),
    CrewTask(
        name="validate_and_materialize",
        description="Validate gaps and materialize catalog/search YouTube resources only.",
        agent=RESOURCE_VALIDATOR,
        expected_output="Learning items with grounded YouTube resources",
        tool_name="validate_and_materialize",
    ),
]


def learning_crew_capability(settings: Settings) -> dict[str, Any]:
    package_ok, package_reason, _ = try_import_crewai()
    return {
        "id": "learning_youtube_crew",
        "name": "Learning path YouTube crew",
        "framework": "CrewAI-compatible sequential",
        "runtime": crew_runtime_mode(),
        "official_crewai_package": official_crewai_installed(),
        "official_crewai_note": package_reason,
        "ready": True,
        "algorithm_version": ALGORITHM_VERSION,
        "agents": [a.role for a in (GAP_ANALYST, YOUTUBE_PLANNER, RESOURCE_VALIDATOR)],
        "tasks": [t.name for t in LEARNING_CREW_TASKS],
        "truthfulness": (
            "Gaps must come from completed ATS evidence. "
            "Exact video recommendations come only from YouTube Data API results — never invented video IDs."
        ),
        "llm_configured": bool(settings.groq_configured or settings.nvidia_configured),
        "youtube_api_configured": bool(getattr(settings, "youtube_configured", False)),
    }


async def run_learning_youtube_crew(
    settings: Settings,
    *,
    evidence_rows: list[dict[str, Any]],
    source_analysis_id: str,
    role_title: str | None = None,
) -> tuple[list[dict[str, Any]], CrewRunResult]:
    """
    Run the sequential learning crew.

    Returns (learning item dicts with resources, audit trail).
    """
    package_ok, package_reason, _ = try_import_crewai()
    audit = CrewRunResult(
        process="sequential",
        runtime=crew_runtime_mode(),
        success=True,
        message=None if package_ok else (package_reason or "Using compatible orchestrator"),
    )
    context: dict[str, Any] = {
        "evidence_rows": evidence_rows,
        "source_analysis_id": source_analysis_id,
        "role_title": role_title,
    }

    # Task 1 — deterministic gap extract
    try:
        gaps_out = tool_extract_ats_gaps(context)
        context.update(gaps_out)
        audit.tasks.append(
            CrewTaskResult(
                name="extract_ats_gaps",
                agent_role=GAP_ANALYST.role,
                tool_name="extract_ats_gaps",
                status="ok",
                output={"gap_count": gaps_out.get("gap_count"), "allowed_gaps": gaps_out.get("allowed_gaps")},
            )
        )
    except Exception as exc:
        audit.success = False
        audit.tasks.append(
            CrewTaskResult(
                name="extract_ats_gaps",
                agent_role=GAP_ANALYST.role,
                tool_name="extract_ats_gaps",
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
            )
        )
        return [], audit

    # Task 2 — LLM / deterministic plan
    try:
        plan_out = await tool_plan_youtube_lessons(settings, context)
        context["plan"] = plan_out.get("plan") or {}
        context["planner_provider"] = plan_out.get("provider")
        audit.tasks.append(
            CrewTaskResult(
                name="plan_youtube_lessons",
                agent_role=YOUTUBE_PLANNER.role,
                tool_name="plan_youtube_lessons",
                status="ok",
                output={
                    "provider": plan_out.get("provider"),
                    "recommendation_count": len((plan_out.get("plan") or {}).get("recommendations") or []),
                },
            )
        )
    except Exception as exc:
        logger.warning("plan_youtube_lessons failed: %s", exc)
        context["plan"] = {"recommendations": []}
        context["planner_provider"] = "failed"
        audit.tasks.append(
            CrewTaskResult(
                name="plan_youtube_lessons",
                agent_role=YOUTUBE_PLANNER.role,
                tool_name="plan_youtube_lessons",
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
            )
        )

    # Task 3 — validate + materialize exact YouTube videos via API
    try:
        final = await tool_validate_and_materialize(settings, context)
        items = list(final.get("items") or [])
        audit.tasks.append(
            CrewTaskResult(
                name="validate_and_materialize",
                agent_role=RESOURCE_VALIDATOR.role,
                tool_name="validate_and_materialize",
                status="ok",
                output={
                    "accepted_count": final.get("accepted_count"),
                    "rejected": final.get("rejected") or [],
                    "youtube_api_configured": final.get("youtube_api_configured"),
                    "youtube_api_video_steps": final.get("youtube_api_video_steps"),
                },
            )
        )
        audit.payload = {
            "algorithm_version": ALGORITHM_VERSION,
            "planner_provider": context.get("planner_provider"),
            "item_count": len(items),
            "source_analysis_id": source_analysis_id,
            "youtube_api_configured": final.get("youtube_api_configured"),
            "youtube_api_video_steps": final.get("youtube_api_video_steps"),
        }
        return items, audit
    except Exception as exc:
        audit.success = False
        audit.tasks.append(
            CrewTaskResult(
                name="validate_and_materialize",
                agent_role=RESOURCE_VALIDATOR.role,
                tool_name="validate_and_materialize",
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
            )
        )
        return [], audit
