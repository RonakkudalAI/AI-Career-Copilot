from __future__ import annotations


def reconcile_sections(sections: dict[str, list[str]]) -> tuple[dict[str, list[str]], int]:
    """Deterministically remove exact duplicate entries within and across sections."""
    result: dict[str, list[str]] = {}
    seen_global: set[str] = set()
    duplicates = 0
    for section, values in sections.items():
        kept: list[str] = []
        for value in values:
            text = str(value or "").strip()
            key = " ".join(text.casefold().split())
            if not key or key in seen_global:
                if key:
                    duplicates += 1
                continue
            seen_global.add(key)
            kept.append(text)
        if kept:
            result[section] = kept
    return result, duplicates
