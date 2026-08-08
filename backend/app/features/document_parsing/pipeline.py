
from __future__ import annotations

import asyncio
import re
from typing import Any

from app.core.config import Settings
from app.features.document_parsing.parsing.llm_sections import extract_sections_enriched
from app.features.document_parsing.parsing.text_extract import extract_text


def _clean_structured(
    result: dict[str, Any], schema_version: str, *, source_text: str | None = None
) -> dict[str, Any]:
    sections = result.get("sections") if isinstance(result.get("sections"), dict) else {}
    sections = {
        str(key): [str(item).strip() for item in (values or []) if str(item).strip()]
        for key, values in sections.items()
        if values
    }
    sections = {key: values for key, values in sections.items() if values}
    warnings = [str(w).strip() for w in (result.get("warnings") or []) if str(w).strip()]
    # URLs are source facts, not model-generated fields. Preserve every URL
    # found in extracted text in a dedicated section for review/profile import.
    source_for_links = source_text or "\n".join(
        [item for values in sections.values() for item in values]
        + [str(item) for item in (result.get("unclassified_blocks") or [])]
    )
    links = sorted(
        {
            match.rstrip(".,;:)]}")
            for match in re.findall(
                r"(?:https?://|www\.)[^\s<>\"']+|(?:linkedin|github)\.com/[^\s<>\"']+",
                source_for_links,
                flags=re.IGNORECASE,
            )
        }
    )
    if links:
        sections["links"] = links
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
    # PDF/DOCX extraction is synchronous and can initialize CPU-heavy models.
    # Keep it off the async server event loop so health/auth requests remain
    # responsive while a document is being parsed.
    plain_text = await asyncio.to_thread(extract_text, content, mime_type)
    extracted = await extract_sections_enriched(
        plain_text,
        settings,
        schema_version=schema_version,
        # Upload/review must not depend on a remote model. The candidate can
        # review deterministic sections immediately; AI enrichment belongs in
        # explicitly AI-powered actions after the source has been persisted.
        prefer_llm=False,
    )
    return plain_text, _clean_structured(extracted, schema_version, source_text=plain_text)
async def parse_source_blocks(blocks, settings: Settings) -> dict[str, Any]:
    source_text = "\n".join(getattr(block, "text", "") for block in (blocks or []) if getattr(block, "text", "").strip())
    extracted = await extract_sections_enriched(source_text, settings, prefer_llm=False)
    return _clean_structured(extracted, str(extracted.get("schema_version") or "resume-extraction-v1"))
