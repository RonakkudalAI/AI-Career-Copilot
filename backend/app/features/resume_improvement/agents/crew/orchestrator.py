"""
Sequential multi-agent orchestrator (CrewAI-compatible process).

Design:
  - Process = sequential (CrewAI-style)
  - Agents have fixed roles; they do NOT freely invent tools or experience
  - Each task runs a named truth-bound tool from tools.py
  - If the official `crewai` package is installed (Python <3.14), we still
    execute the same tools here for determinism; package presence is reported
    in metadata only unless explicitly extended later.
"""

from __future__ import annotations

import logging
from typing import Any

from app.features.resume_improvement.agents.crew.compat import crew_runtime_mode, official_crewai_installed, try_import_crewai
from app.features.resume_improvement.agents.crew.models import CrewAgent, CrewRunResult, CrewTask, CrewTaskResult
from app.features.resume_improvement.agents.crew.tools import (
    tool_analyze_ats_gaps,
    tool_generate_resume_suggestions,
    tool_validate_suggestions,
)
from app.core.config import Settings
from app.core.errors import ApiError
from app.api.schemas import ProviderSuggestion, ProviderSuggestionResult

logger = logging.getLogger(__name__)

# Fixed crew roles (not free-form persona prompts that invent resume content).
GAP_ANALYST = CrewAgent(
    role="ATS Gap Analyst",
    goal="Summarize missing JD keywords already present in supplied ATS evidence only.",
    backstory=(
        "You only read ATS evidence provided by the system. "
        "You never invent skills, employers, or metrics."
    ),
)

RESUME_IMPROVER = CrewAgent(
    role="Resume Improvement Specialist",
    goal="Propose rewrites only for confirmed resume blocks using NVIDIA evidence rules.",
    backstory=(
        "You improve clarity and keyword alignment for text that already exists. "
        "You never fabricate experience."
    ),
)

EVIDENCE_VALIDATOR = CrewAgent(
    role="Evidence Validator",
    goal="Drop any suggestion that fails Career Copilot evidence validation.",
    backstory="You are a deterministic gate. Unsafe suggestions are blocked.",
)

RESUME_CREW_TASKS = [
    CrewTask(
        name="analyze_gaps",
        description="Extract missing keywords from ATS evidence already attached to this run.",
        agent=GAP_ANALYST,
        expected_output="JSON list of missing_keywords from evidence only",
        tool_name="analyze_ats_gaps",
    ),
    CrewTask(
        name="generate_suggestions",
        description="Generate evidence-bound resume suggestions via NVIDIA for selected blocks.",
        agent=RESUME_IMPROVER,
        expected_output="ProviderSuggestionResult JSON",
        tool_name="generate_resume_suggestions",
    ),
    CrewTask(
        name="validate_suggestions",
        description="Validate each suggestion with server-side evidence checks.",
        agent=EVIDENCE_VALIDATOR,
        expected_output="Filtered suggestions that passed validation",
        tool_name="validate_suggestions",
    ),
]


async def run_resume_improvement_crew(
    settings: Settings,
    context: dict[str, Any],
    *,
    allowed_sections: set[str],
) -> tuple[ProviderSuggestionResult, CrewRunResult]:
    """
    Run the sequential resume-improvement crew.

    Returns (validated ProviderSuggestionResult, crew audit result).
    """
    package_ok, package_reason, _ = try_import_crewai()
    runtime = crew_runtime_mode()
    audit = CrewRunResult(
        process="sequential",
        runtime=runtime,
        success=True,
        message=(
            None
            if package_ok
            else (package_reason or "Using compatible orchestrator")
        ),
    )

    # --- Task 1: gap analysis (deterministic) ---
    try:
        gaps = tool_analyze_ats_gaps(context)
        # Enrich context for improver without inventing terms
        context = {
            **context,
            "crew_gap_summary": {
                "missing_keywords": gaps.get("missing_keywords") or [],
                "missing": gaps.get("missing") or [],
                "matched": gaps.get("matched") or [],
                "selected_block_count": gaps.get("selected_block_count"),
            },
        }
        audit.tasks.append(
            CrewTaskResult(
                name="analyze_gaps",
                agent_role=GAP_ANALYST.role,
                tool_name="analyze_ats_gaps",
                status="ok",
                output=gaps,
            )
        )
    except Exception as exc:
        logger.exception("crew_analyze_gaps_failed")
        audit.tasks.append(
            CrewTaskResult(
                name="analyze_gaps",
                agent_role=GAP_ANALYST.role,
                tool_name="analyze_ats_gaps",
                status="failed",
                error=str(exc),
            )
        )
        # Non-fatal: improver can still run without gap summary
        gaps = {}

    # --- Task 2: generate suggestions (NVIDIA) ---
    try:
        raw = await tool_generate_resume_suggestions(settings, context)
        audit.tasks.append(
            CrewTaskResult(
                name="generate_suggestions",
                agent_role=RESUME_IMPROVER.role,
                tool_name="generate_resume_suggestions",
                status="ok",
                output={"suggestion_count": len(raw.suggestions)},
            )
        )
    except ApiError:
        audit.success = False
        audit.tasks.append(
            CrewTaskResult(
                name="generate_suggestions",
                agent_role=RESUME_IMPROVER.role,
                tool_name="generate_resume_suggestions",
                status="failed",
                error="nvidia_api_error",
            )
        )
        raise
    except Exception as exc:
        audit.success = False
        audit.tasks.append(
            CrewTaskResult(
                name="generate_suggestions",
                agent_role=RESUME_IMPROVER.role,
                tool_name="generate_resume_suggestions",
                status="failed",
                error=str(exc),
            )
        )
        raise ApiError(
            500,
            "crew_generate_failed",
            "The resume improvement crew could not generate suggestions.",
        ) from exc

    # --- Task 3: validate (deterministic) ---
    try:
        validated = tool_validate_suggestions(raw, context, allowed_sections)
        kept_raw = validated.get("suggestions") or []
        kept_models: list[ProviderSuggestion] = []
        for item in kept_raw:
            try:
                kept_models.append(ProviderSuggestion.model_validate(item))
            except Exception:
                continue
        final = ProviderSuggestionResult(suggestions=kept_models)
        audit.tasks.append(
            CrewTaskResult(
                name="validate_suggestions",
                agent_role=EVIDENCE_VALIDATOR.role,
                tool_name="validate_suggestions",
                status="ok",
                output={
                    "received": validated.get("received"),
                    "available": validated.get("available"),
                    "blocked": validated.get("blocked"),
                },
            )
        )
        audit.payload = {
            "suggestions": [s.model_dump() for s in final.suggestions],
            "gap_summary": gaps,
            "validation": {
                "received": validated.get("received"),
                "available": validated.get("available"),
                "blocked": validated.get("blocked"),
            },
            "crew": {
                "process": "sequential",
                "runtime": runtime,
                "package_crewai_available": package_ok,
            },
        }
        return final, audit
    except Exception as exc:
        audit.success = False
        audit.tasks.append(
            CrewTaskResult(
                name="validate_suggestions",
                agent_role=EVIDENCE_VALIDATOR.role,
                tool_name="validate_suggestions",
                status="failed",
                error=str(exc),
            )
        )
        raise ApiError(
            500,
            "crew_validate_failed",
            "The resume improvement crew could not validate suggestions.",
        ) from exc


def crew_capability(settings: Settings) -> dict[str, Any]:
    package_ok = official_crewai_installed()
    reason = (
        "Official CrewAI is installed and will load when a crew operation runs."
        if package_ok
        else "Using Career Copilot's compatible sequential orchestrator."
    )
    return {
        "id": "resume_improvement_crew",
        "name": "Resume improvement crew (CrewAI-compatible)",
        "framework": "crewai_compatible_sequential",
        "runtime": crew_runtime_mode(),
        "official_crewai_package": package_ok,
        "official_crewai_note": reason,
        "process": "sequential",
        "agents": [
            {"role": GAP_ANALYST.role, "tool": "analyze_ats_gaps"},
            {"role": RESUME_IMPROVER.role, "tool": "generate_resume_suggestions", "provider": "nvidia"},
            {"role": EVIDENCE_VALIDATOR.role, "tool": "validate_suggestions"},
        ],
        "tasks": [t.name for t in RESUME_CREW_TASKS],
        "truthfulness": (
            "Tools only use supplied ATS evidence, confirmed resume blocks, "
            "and server-side validation. No free-form invention of experience."
        ),
        "enabled": True,
        "ready": bool(settings.nvidia_configured),
        "requires_nvidia": True,
    }
