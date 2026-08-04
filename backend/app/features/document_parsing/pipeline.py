from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.features.document_parsing.confidence import calculate_confidence
from app.features.document_parsing.contamination import find_contamination
from app.features.document_parsing.grounding import ground_sections
from app.features.document_parsing.reconciliation import reconcile_sections
from app.features.document_parsing.source_blocks import SourceBlock
from app.features.document_parsing.parsing.llm_sections import extract_sections_enriched


async def parse_source_blocks(
    blocks: list[SourceBlock], settings: Settings, *, is_scanned: bool = False
) -> dict[str, Any]:
    """Run deterministic structure, optional Groq/NVIDIA extraction, and evidence validation."""
    source_text = "\n".join(block.text for block in blocks if block.text.strip())
    extracted = await extract_sections_enriched(source_text, settings)
    sections, duplicate_count = reconcile_sections(dict(extracted.get("sections") or {}))
    sections, evidence_map, grounding_warnings = ground_sections(sections, blocks)
    contamination = find_contamination(evidence_map, blocks)
    warnings = [*extracted.get("warnings", []), *grounding_warnings]
    if contamination:
        warnings.append(f"Detected {len(contamination)} section placement issue(s); review required.")
    total_values = sum(len(values) for values in sections.values())
    confidence = calculate_confidence(
        total_values=total_values,
        grounded_values=sum(len(values) for values in evidence_map.values()),
        warnings=len(warnings),
        contamination_issues=len(contamination),
        is_scanned=is_scanned,
    )
    return {
        **extracted,
        "sections": sections,
        "source_blocks": [block.model_dump(mode="json") for block in blocks],
        "evidence_block_ids": evidence_map,
        "validation": {
            "grounding": "passed" if not grounding_warnings else "filtered",
            "contamination": "passed" if not contamination else "review_required",
            "duplicates_removed": duplicate_count,
            "contamination_issues": contamination,
        },
        "confidence": confidence,
        "warnings": warnings,
        "extraction_method": f"{extracted.get('extraction_method', 'unknown')}_source_grounded_v1",
    }
