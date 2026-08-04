from __future__ import annotations

import re
from collections.abc import Iterable

from app.features.document_parsing.source_blocks import SourceBlock


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").casefold()).strip()


def evidence_block_ids(value: str, blocks: Iterable[SourceBlock]) -> list[str]:
    """
    Return source blocks that fully contain the value (normalized whitespace).

    Fuzzy token overlap is intentionally NOT used — values must be source quotes.
    """
    needle = _normalise(value)
    if not needle:
        return []
    matched: list[str] = []
    for block in blocks:
        haystack = _normalise(block.text)
        if not haystack:
            continue
        if needle in haystack:
            matched.append(block.block_id)
            continue
        # Multi-line values: every non-empty line must appear in some block text.
        lines = [ln for ln in (_normalise(part) for part in value.splitlines()) if ln]
        if len(lines) > 1 and all(any(ln in _normalise(b.text) for b in blocks) for ln in lines):
            # Attach only blocks that contain at least one of those lines.
            if any(ln in haystack for ln in lines):
                matched.append(block.block_id)
    return matched


def ground_sections(
    sections: dict[str, list[str]], blocks: list[SourceBlock]
) -> tuple[dict[str, list[str]], dict[str, list[list[str]]], list[str]]:
    """Drop unsupported section values and attach block IDs for retained values."""
    grounded: dict[str, list[str]] = {}
    evidence: dict[str, list[list[str]]] = {}
    warnings: list[str] = []
    for section, values in sections.items():
        kept: list[str] = []
        kept_evidence: list[list[str]] = []
        for value in values:
            text = str(value or "").strip()
            if not text:
                continue
            ids = evidence_block_ids(text, blocks)
            if not ids:
                warnings.append(f"Dropped ungrounded value from {section} (not found in source blocks).")
                continue
            kept.append(text)
            kept_evidence.append(ids)
        if kept:
            grounded[section] = kept
            evidence[section] = kept_evidence
    return grounded, evidence, warnings
