"""Evidence-constrained ATS improvement brief generation."""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.providers.groq_client import GroqClient
from app.agents.providers.nvidia_client import NvidiaClient, PROMPTS_DIR
from app.core.config import Settings

logger = logging.getLogger(__name__)
_PROMPT_PATH = PROMPTS_DIR / "ats_improvement_v1.txt"


class AtsImprovementBriefResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    overall_inference: str = Field(min_length=20, max_length=6000)
    focus_areas: list[str] = Field(default_factory=list, max_length=12)
    priority_actions: list[str] = Field(default_factory=list, max_length=12)
    section_guidance: list[str] = Field(default_factory=list, max_length=20)
    do_not_claim: list[str] = Field(default_factory=list, max_length=12)


def _deterministic_brief(
    *,
    score: float,
    missing: list[str],
    matched_count: int,
    total: int,
    role_title: str | None,
    missing_items: list[dict[str, Any]],
) -> dict[str, Any]:
    """Create a structured fallback from the same evidence supplied to the LLM."""
    missing = [m for m in missing if m]
    if not missing:
        return {
            "overall_inference": (
                f"Keyword coverage is {score:.0f}% ({matched_count}/{total} scored terms found). "
                "No scored JD requirements were missing from the confirmed resume. "
                "This is keyword coverage only, not a hiring prediction."
            ),
            "focus_areas": [],
            "priority_actions": [],
            "section_guidance": [],
            "do_not_claim": ["Do not treat keyword coverage as a hiring prediction."],
            "provider": "deterministic",
        }

    role = (role_title or "").strip()
    role_bit = f" for the role '{role}'" if role else ""
    terms = ", ".join(missing[:40])
    extra = f" (+{len(missing) - 40} more)" if len(missing) > 40 else ""
    priority_actions = [
        f"Review whether '{item.get('term')}' is truthful, then add it under "
        f"{item.get('suggested_section', 'skills')} if supported."
        for item in missing_items
        if item.get("term") in missing
    ][:12]
    section_guidance = [
        f"{item.get('term')}: suggested section {item.get('suggested_section', 'skills')} "
        f"({item.get('priority', 'critical')})."
        for item in missing_items
        if item.get("term") in missing
    ][:20]
    return {
        "overall_inference": (
            f"Keyword coverage is {score:.0f}% ({matched_count}/{total} scored terms found){role_bit}. "
            f"These JD requirements were not found in the confirmed resume: {terms}{extra}. "
            "Only add a requirement when it reflects real experience; this is not a hiring prediction."
        ),
        "focus_areas": missing[:12],
        "priority_actions": priority_actions,
        "section_guidance": section_guidance,
        "do_not_claim": [
            "Do not claim experience with a missing requirement unless it is true.",
            "Do not treat this score as a hiring prediction.",
        ],
        "provider": "deterministic",
    }


def _validate_inference(text: str, allowed_items: list[dict[str, Any]]) -> str:
    """Remove sentences that introduce known technical terms without evidence."""
    allowed = {str(item.get("term", "")).casefold() for item in allowed_items}
    known = {
        "docker", "kubernetes", "python", "javascript", "typescript", "react",
        "node.js", "nodejs", "sql", "machine learning", "computer vision", "llm", "rag",
    }
    safe: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", (text or "").strip()):
        lowered = sentence.casefold()
        unsupported = [
            term for term in known
            if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", lowered)
            and not any(term in item for item in allowed)
        ]
        if not unsupported:
            safe.append(sentence)
    return " ".join(safe).strip()


async def generate_ats_improvement_brief(
    settings: Settings,
    *,
    overall_score: float,
    missing_terms: list[str],
    matched_count: int,
    total_terms: int,
    role_title: str | None = None,
    company: str | None = None,
    missing_items: list[dict[str, Any]] | None = None,
    matched_items: list[dict[str, Any]] | None = None,
    structured_parameter_scores: dict[str, float] | None = None,
    domain_gate: dict[str, Any] | None = None,
    resume_section_summary: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    missing = [str(term).strip() for term in (missing_terms or []) if str(term).strip()]
    missing_items = missing_items or [
        {"term": term, "priority": "critical", "suggested_section": "skills"}
        for term in missing
    ]
    matched_items = matched_items or []
    evidence_items = missing_items + matched_items
    payload = {
        "score": overall_score,
        "method": "deterministic phrase coverage plus optional structured score",
        "role": role_title,
        "company": company,
        "missing": missing_items,
        "matched": matched_items[:20],
        "structured_parameter_scores": structured_parameter_scores,
        "domain_gate": domain_gate,
        "resume_section_summary": resume_section_summary or {},
        "rules": [
            "Use only supplied fields; every claim must cite a missing or matched item.",
            "Do not invent employers, projects, metrics, years, tools, or achievements.",
            "Do not claim the candidate already has a missing requirement.",
            "Return JSON with overall_inference, priority_actions, section_guidance, and do_not_claim.",
        ],
    }
    prompt = _PROMPT_PATH.read_text(encoding="utf-8") if _PROMPT_PATH.is_file() else (
        "Return the required evidence-constrained JSON fields only."
    )

    if settings.nvidia_configured:
        try:
            result = await NvidiaClient(settings).generate_structured(
                system_prompt=prompt, user_payload=payload,
                schema_model=AtsImprovementBriefResult,
                temperature=min(settings.nvidia_temperature, 0.3),
            )
            allowed = {term.casefold() for term in missing}
            focus = [item for item in result.focus_areas if any(term in str(item).casefold() for term in allowed)] or missing[:8]
            inference = _validate_inference(result.overall_inference, evidence_items)
            if not inference:
                inference = _deterministic_brief(
                    score=overall_score, missing=missing, matched_count=matched_count,
                    total=total_terms, role_title=role_title, missing_items=missing_items,
                )["overall_inference"]
            return {
                "overall_inference": inference, "focus_areas": focus[:12],
                "priority_actions": result.priority_actions[:12],
                "section_guidance": result.section_guidance[:20],
                "do_not_claim": result.do_not_claim[:12], "provider": "nvidia",
                "model": settings.nvidia_model, "agent": "ats_improvement_brief", "fallback": False,
            }
        except Exception as exc:
            logger.warning("ats_brief_nvidia_failed error=%s", exc)

    if settings.groq_configured:
        try:
            result = await GroqClient(settings).generate_structured(
                system_prompt=prompt, user_payload=payload,
                schema_model=AtsImprovementBriefResult,
                temperature=min(settings.groq_temperature, 0.4),
            )
            allowed = {term.casefold() for term in missing}
            focus = [item for item in result.focus_areas if any(term in str(item).casefold() for term in allowed)] or missing[:12]
            inference = _validate_inference(result.overall_inference, evidence_items)
            if not inference:
                inference = _deterministic_brief(
                    score=overall_score, missing=missing, matched_count=matched_count,
                    total=total_terms, role_title=role_title, missing_items=missing_items,
                )["overall_inference"]
            return {
                "overall_inference": inference,
                "focus_areas": focus[:12], "priority_actions": result.priority_actions[:12],
                "section_guidance": result.section_guidance[:20],
                "do_not_claim": result.do_not_claim[:12], "provider": "groq",
                "model": settings.groq_model, "agent": "ats_improvement_brief", "fallback": False,
            }
        except Exception as exc:
            logger.warning("ats_brief_groq_failed error=%s", exc)

    brief = _deterministic_brief(
        score=overall_score, missing=missing, matched_count=matched_count,
        total=total_terms, role_title=role_title, missing_items=missing_items,
    )
    brief["agent"] = "ats_improvement_brief"
    brief["fallback"] = True
    return brief
