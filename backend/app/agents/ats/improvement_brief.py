"""
Overall ATS improvement brief from missing keywords only.

Uses NVIDIA if configured, otherwise Groq if configured.
Never invents candidate experience — only discusses scored missing terms.
Not a fallback inside resume-improvement or profile-fill pipelines.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.llm.groq_client import GroqClient
from app.agents.llm.nvidia_client import NvidiaClient, PROMPTS_DIR
from app.core.config import Settings
from app.core.errors import ApiError

logger = logging.getLogger(__name__)
_PROMPT_PATH = PROMPTS_DIR / "ats_improvement_v1.txt"


class AtsImprovementBriefResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    overall_inference: str = Field(min_length=20, max_length=6000)
    focus_areas: list[str] = Field(default_factory=list, max_length=12)


def _deterministic_brief(
    *,
    score: float,
    missing: list[str],
    matched_count: int,
    total: int,
    role_title: str | None,
) -> dict[str, Any]:
    """Source-true brief with no invented experience (no canned marketing copy)."""
    missing = [m for m in missing if m]
    if not missing:
        text = (
            f"Keyword coverage is {score:.0f}/100 ({matched_count}/{total} scored terms found). "
            "No scored JD keywords were missing from the resume after normalization. "
            "This measures exact token coverage only and is not a hiring prediction."
        )
        return {"overall_inference": text, "focus_areas": [], "provider": "deterministic"}

    role = (role_title or "").strip()
    role_bit = f" for the role “{role}”" if role else ""
    terms = ", ".join(missing[:40])
    extra = f" (+{len(missing) - 40} more)" if len(missing) > 40 else ""
    text = (
        f"Keyword coverage is {score:.0f}/100 ({matched_count}/{total} scored terms found){role_bit}. "
        f"These normalized JD terms were not found in the resume: {terms}{extra}. "
        "If any of these reflect work you have actually done, add them explicitly in your skills list "
        "or experience bullets using wording close to the job description. "
        "Do not add terms that do not match real experience. "
        "This is keyword coverage only, not a hiring prediction."
    )
    # Focus areas = first missing terms themselves (no invented themes)
    return {
        "overall_inference": text,
        "focus_areas": missing[:12],
        "provider": "deterministic",
    }


async def generate_ats_improvement_brief(
    settings: Settings,
    *,
    overall_score: float,
    missing_terms: list[str],
    matched_count: int,
    total_terms: int,
    role_title: str | None = None,
    company: str | None = None,
) -> dict[str, Any]:
    """
    Generate overall improvement inference from missing keywords only.
    AI is constrained to the provided missing term list.
    """
    missing = [str(t).strip() for t in (missing_terms or []) if str(t).strip()]
    payload = {
        "overall_score": overall_score,
        "matched_count": matched_count,
        "total_terms": total_terms,
        "missing_keywords": missing,
        "job_role_title": role_title,
        "job_company": company,
        "rules": [
            "Only discuss missing_keywords provided.",
            "Do not invent resume experience or employers.",
            "Do not claim the candidate already has missing skills.",
        ],
    }

    prompt = _PROMPT_PATH.read_text(encoding="utf-8") if _PROMPT_PATH.is_file() else (
        "Write overall_inference JSON about missing_keywords only. Do not invent experience."
    )

    # Dedicated providers for this task (not used as fallbacks inside other agents).
    if settings.nvidia_configured:
        try:
            result: AtsImprovementBriefResult = await NvidiaClient(settings).generate_structured(
                system_prompt=prompt,
                user_payload=payload,
                schema_model=AtsImprovementBriefResult,
                temperature=min(settings.nvidia_temperature, 0.3),
            )
            # Guard: AI must not invent focus areas outside missing list
            allowed = {m.casefold() for m in missing}
            focus = [
                f for f in (result.focus_areas or []) if str(f).casefold() in allowed or not allowed
            ]
            if allowed:
                focus = [f for f in (result.focus_areas or []) if any(a in str(f).casefold() for a in allowed)] or missing[:8]
            return {
                "overall_inference": result.overall_inference.strip(),
                "focus_areas": focus[:12],
                "provider": "nvidia",
                "model": settings.nvidia_model,
                "agent": "ats_improvement_brief",
                "fallback": False,
            }
        except Exception as exc:
            logger.warning("ats_brief_nvidia_failed error=%s", exc)

    if settings.groq_configured:
        try:
            result = await GroqClient(settings).generate_structured(
                system_prompt=prompt,
                user_payload=payload,
                schema_model=AtsImprovementBriefResult,
                temperature=min(settings.groq_temperature, 0.4),
            )
            allowed = {m.casefold() for m in missing}
            focus = missing[:12]
            if result.focus_areas and allowed:
                # Keep only focus lines that mention a missing keyword
                filtered = []
                for f in result.focus_areas:
                    fl = str(f).casefold()
                    if any(a in fl for a in allowed):
                        filtered.append(str(f))
                focus = filtered[:12] or missing[:12]
            return {
                "overall_inference": result.overall_inference.strip(),
                "focus_areas": focus,
                "provider": "groq",
                "model": settings.groq_model,
                "agent": "ats_improvement_brief",
                "fallback": False,
            }
        except Exception as exc:
            logger.warning("ats_brief_groq_failed error=%s", exc)

    brief = _deterministic_brief(
        score=overall_score,
        missing=missing,
        matched_count=matched_count,
        total=total_terms,
        role_title=role_title,
    )
    brief["agent"] = "ats_improvement_brief"
    brief["fallback"] = True
    return brief
