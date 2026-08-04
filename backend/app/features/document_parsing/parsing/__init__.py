"""
Source-true document parsing (resume + JD).

Prefer LLM segregation when configured; structural layout is the offline fallback.
No invented content: retained segments must appear in the source text.
"""

from app.features.document_parsing.parsing.llm_sections import extract_sections_enriched
from app.features.document_parsing.parsing.sections import (
    HEADING_ALIASES,
    extract_sections,
    match_section_heading,
)
from app.features.document_parsing.parsing.text_extract import extract_text

__all__ = [
    "HEADING_ALIASES",
    "extract_sections",
    "extract_sections_enriched",
    "extract_text",
    "match_section_heading",
]
