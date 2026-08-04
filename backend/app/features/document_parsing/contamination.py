from __future__ import annotations

from collections.abc import Iterable

from app.features.document_parsing.source_blocks import SourceBlock


_SECTION_HINTS = {
    "skills": ("skill", "technology", "tool", "competenc", "stack"),
    "experience": ("experience", "employment", "work", "internship"),
    "projects": ("project",),
    "education": ("education", "academic", "degree"),
}


def _canonical(section: str) -> str | None:
    value = section.casefold()
    for key, hints in _SECTION_HINTS.items():
        if any(hint in value for hint in hints):
            return key
    return None


def find_contamination(
    evidence_map: dict[str, list[list[str]]], blocks: Iterable[SourceBlock]
) -> list[dict[str, str]]:
    """Report clear section-placement conflicts without guessing ambiguous headings."""
    by_id = {block.block_id: block for block in blocks}
    issues: list[dict[str, str]] = []
    for section, item_evidence in evidence_map.items():
        target = _canonical(section)
        if not target:
            continue
        for ids in item_evidence:
            contexts = {
                _canonical(by_id[block_id].heading_context or "")
                for block_id in ids
                if block_id in by_id
            }
            contexts.discard(None)
            if len(contexts) == 1 and target not in contexts:
                issues.append({"section": section, "source_section": next(iter(contexts))})
    return issues
