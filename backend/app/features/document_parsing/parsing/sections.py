
from __future__ import annotations

from typing import Any

from app.features.document_parsing.parsing.llm_sections import (
    _looks_like_heading,
    _slug_kind,
    extract_sections_structural,
)

HEADING_ALIASES: dict[str, frozenset[str]] = {}
def match_section_heading(line: str) -> str | None:
    if not _looks_like_heading(line):
        return None
    return _slug_kind(line.rstrip(":").strip())
def extract_sections(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    return extract_sections_structural(text, schema_version)
