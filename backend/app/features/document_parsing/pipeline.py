
from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.features.document_parsing.parsing.llm_sections import extract_sections_enriched
from app.features.document_parsing.parsing.text_extract import extract_text


def _clean_structured(result: dict[str, Any], schema_version: str) -> dict[str, Any]:
    sections = result.get("sections") if isinstance(result.get("sections"), dict) else {}
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
    plain_text = extract_text(content, mime_type)
    extracted = await extract_sections_enriched(
        plain_text,
        settings,
        schema_version=schema_version,
        prefer_llm=True,
    )
    return plain_text, _clean_structured(extracted, schema_version)
async def parse_source_blocks(blocks, settings: Settings) -> dict[str, Any]:
    source_text = "\n".join(getattr(block, "text", "") for block in (blocks or []) if getattr(block, "text", "").strip())
    extracted = await extract_sections_enriched(source_text, settings, prefer_llm=True)
    return _clean_structured(extracted, str(extracted.get("schema_version") or "resume-extraction-v1"))
