"""
Sync section parser facade.

Primary segregation is LLM-assisted (see llm_sections.py). This module keeps a
sync structural fallback and stable import paths for routes/tests.
"""

from __future__ import annotations

from typing import Any

from app.features.document_parsing.parsing.llm_sections import (
    extract_sections_structural,
    _looks_like_heading,
    _slug_kind,
)

# Retained only for import compatibility with older callers/tests.
# Headings are no longer selected from a fixed vocabulary.
HEADING_ALIASES: dict[str, frozenset[str]] = {}


def match_section_heading(line: str) -> str | None:
    """
    Return a slug key when the line looks like a document heading.
    Uses layout cues only — not a fixed heading dictionary.
    """
    if not _looks_like_heading(line):
        return None
    return _slug_kind(line.rstrip(":").strip())


def extract_sections(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    """
    Sync structural section parse (no LLM).

    Prefer `extract_sections_enriched` at upload time when an LLM is available.
    """
    return extract_sections_structural(text, schema_version)
