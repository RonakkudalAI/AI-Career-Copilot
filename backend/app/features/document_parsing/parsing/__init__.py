"""
Source-true document parsing (resume + JD).

No invented content: extract text from the file, then assign lines to sections
only when an explicit heading is recognised. Optional Docling improves PDF layout
extraction when installed; otherwise pypdf / python-docx are used.
"""

from app.features.document_parsing.parsing.sections import (
    HEADING_ALIASES,
    extract_sections,
    match_section_heading,
)
from app.features.document_parsing.parsing.text_extract import extract_text

__all__ = [
    "HEADING_ALIASES",
    "extract_sections",
    "extract_text",
    "match_section_heading",
]
