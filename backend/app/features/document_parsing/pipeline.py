"""
Simple document parse pipeline.

1) Extract plain text (Docling for PDF).
2) Segregate into sections (LLM line assignment when configured, else structural).
3) Return a clean structured_content payload — sections only, no source-block UI clutter.
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.features.document_parsing.parsing.llm_sections import extract_sections_enriched
from app.features.document_parsing.parsing.text_extract import extract_text


def _clean_structured(result: dict[str, Any], schema_version: str) -> dict[str, Any]:
    """Keep only fields the product UI and ATS need — no source_blocks / evidence maps."""
    sections = result.get("sections") if isinstance(result.get("sections"), dict) else {}
    # Drop empty section lists
    sections = {
        str(key): [str(item).strip() for item in (values or []) if str(item).strip()]
        for key, values in sections.items()
        if values
    }
    sections = {key: values for key, values in sections.items() if values}
    warnings = [str(w).strip() for w in (result.get("warnings") or []) if str(w).strip()]
    return {
        "schema_version": schema_version,
        "sections": sections,
        "warnings": warnings,
        "extraction_method": str(result.get("extraction_method") or "simple_parse_v1"),
    }


async def parse_document_bytes(
    content: bytes,
    *,
    mime_type: str,
    settings: Settings,
    schema_version: str = "resume-extraction-v1",
) -> tuple[str, dict[str, Any]]:
    """
    Parse a resume/JD file into plain text + simple section map.

    Returns:
      (plain_text, structured_content)
    """
    plain_text = extract_text(content, mime_type)
    extracted = await extract_sections_enriched(
        plain_text,
        settings,
        schema_version=schema_version,
        prefer_llm=True,
    )
    return plain_text, _clean_structured(extracted, schema_version)


async def parse_source_blocks(blocks, settings: Settings, *, is_scanned: bool = False) -> dict[str, Any]:
    """
    Compatibility wrapper used by older call sites.

    Converts block text to plain text and runs the simple section pipeline.
    Does not attach source_blocks to the result.
    """
    del is_scanned  # unused — simple pipeline does not branch on scan flag
    source_text = "\n".join(getattr(block, "text", "") for block in (blocks or []) if getattr(block, "text", "").strip())
    extracted = await extract_sections_enriched(source_text, settings, prefer_llm=True)
    return _clean_structured(extracted, str(extracted.get("schema_version") or "resume-extraction-v1"))
