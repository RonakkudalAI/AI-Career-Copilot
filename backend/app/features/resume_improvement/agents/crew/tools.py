"""
Truth-bound tools used by the resume-improvement crew.

These tools ONLY wrap existing Career Copilot logic:
  - gap analysis from provided ATS context (no invention)
  - NVIDIA resume suggestions (existing NvidiaClient.generate)
  - deterministic validation (existing validate_suggestion)

No tool invents experience, employers, metrics, or skills.
"""

from __future__ import annotations

from typing import Any

from app.agents.providers import NvidiaClient
from app.core.config import Settings
from app.core.errors import ApiError
from app.features.resume_management.evidence import build_blocks
from app.features.resume_management.validation import validate_suggestion
from app.api.schemas import ProviderSuggestion, ProviderSuggestionResult


def tool_analyze_ats_gaps(context: dict[str, Any]) -> dict[str, Any]:
    """
    Deterministic gap summary from context already loaded for the improvement run.
    Does not call an LLM and does not invent missing terms.
    """
    ats_evidence = context.get("ats_evidence") or []
    missing: list[str] = []
    matched: list[str] = []
    missing_items: list[dict[str, Any]] = []
    matched_items: list[dict[str, Any]] = []
    for row in ats_evidence:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or "").strip()
        status = str(row.get("match_status") or "").strip().lower()
        if not req:
            continue
        if status in {"not_found", "missing"}:
            missing.append(req)
            missing_items.append(
                {
                    "term": req,
                    "priority": row.get("priority") or ("preferred" if row.get("requirement_type") == "preferred" else "critical"),
                    "suggested_section": row.get("suggested_section") or "skills",
                    "section": row.get("resume_section"),
                }
            )
        elif status in {"strong_match", "partial_match", "matched"}:
            matched.append(req)
            matched_items.append(
                {
                    "term": req,
                    "section": row.get("resume_section"),
                    "evidence_line": row.get("resume_evidence_text"),
                    "match_strength": status,
                }
            )

    selected = context.get("selected_blocks") or []
    return {
        "tool": "analyze_ats_gaps",
        "missing_keywords": missing[:50],
        "missing": missing_items[:50],
        "matched_keywords_sample": matched[:20],
        "matched": matched_items[:20],
        "selected_block_count": len(selected),
        "has_job_description": bool(context.get("job_description")),
        "notes": (
            "Gaps are taken only from supplied ATS evidence. "
            "No new requirements are invented by this tool."
        ),
    }


async def tool_generate_resume_suggestions(
    settings: Settings, context: dict[str, Any]
) -> ProviderSuggestionResult:
    """Call the existing NVIDIA resume-improvement generator only."""
    if not settings.nvidia_configured:
        raise ApiError(
            503,
            "nvidia_not_configured",
            "AI improvements are not configured. Manual editing and export remain available.",
        )
    return await NvidiaClient(settings).generate(context)


def _block_map_from_context(context: dict[str, Any]) -> dict[str, Any]:
    """
    Prefer full evidence blocks attached by the pipeline (`context['_blocks']`).
    Fall back to reconstructing from selected_blocks (same ids when order preserved).
    """
    from app.features.resume_management.evidence import ResumeBlock, normalize_text, source_hash

    raw_blocks = context.get("_blocks")
    if isinstance(raw_blocks, list) and raw_blocks:
        out: dict[str, ResumeBlock] = {}
        for item in raw_blocks:
            if isinstance(item, ResumeBlock):
                out[item.block_id] = item
            elif isinstance(item, dict) and item.get("block_id"):
                text = normalize_text(str(item.get("text") or ""))
                out[str(item["block_id"])] = ResumeBlock(
                    block_id=str(item["block_id"]),
                    section_key=str(item.get("section_key") or ""),
                    text=text,
                    source_hash=str(item.get("source_hash") or source_hash(text)),
                )
        if out:
            return out

    # Fallback: rebuild section lists from selected_blocks only
    by_section: dict[str, list[str]] = {}
    for item in context.get("selected_blocks") or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("section_key") or "")
        text = str(item.get("text") or "")
        if key and text:
            by_section.setdefault(key, []).append(text)
    return {b.block_id: b for b in build_blocks({"sections": by_section})}


def tool_validate_suggestions(
    result: ProviderSuggestionResult,
    context: dict[str, Any],
    allowed_sections: set[str],
) -> dict[str, Any]:
    """
    Run the same evidence validator used by the production improvement pipeline.
    Returns only suggestions that pass or warn — blocked ones are dropped.
    """
    block_map = _block_map_from_context(context)

    kept: list[ProviderSuggestion] = []
    blocked = 0
    issues_log: list[dict[str, Any]] = []
    for suggestion in result.suggestions:
        validation = validate_suggestion(suggestion, block_map, allowed_sections)
        if validation.status == "blocked":
            blocked += 1
            issues_log.append(
                {
                    "source_block_id": suggestion.source_block_id,
                    "status": "blocked",
                    "issues": validation.issues,
                }
            )
            continue
        kept.append(suggestion)
        if validation.issues:
            issues_log.append(
                {
                    "source_block_id": suggestion.source_block_id,
                    "status": validation.status,
                    "issues": validation.issues,
                }
            )

    return {
        "tool": "validate_suggestions",
        "received": len(result.suggestions),
        "available": len(kept),
        "blocked": blocked,
        "issues": issues_log[:40],
        "suggestions": [s.model_dump() for s in kept],
        "notes": "Only evidence-validated suggestions are kept. Blocked items never reach the user.",
    }
