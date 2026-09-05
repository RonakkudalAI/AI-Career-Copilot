"""Stable, lossless JSON projections used by ATS and agent workflows.

The parser's human-review shape remains backwards compatible in ``sections``.
This projection gives downstream code explicit semantic buckets and never moves
project content into employment history (or vice versa).
"""

from __future__ import annotations

from typing import Any


def _values(sections: dict[str, list[str]], *names: str) -> list[str]:
    wanted = tuple(name.casefold() for name in names)
    result: list[str] = []
    for key, items in sections.items():
        key_l = key.casefold()
        if any(name in key_l for name in wanted):
            result.extend(item for item in items if item.strip())
    return result


def build_semantic_json(
    sections: dict[str, list[str]], *, document_type: str
) -> dict[str, Any]:
    """Return a deterministic, lossless semantic envelope for agent input."""
    is_jd = document_type == "job_description"
    if is_jd:
        return {
            "schema_version": "semantic-document-v1",
            "document_type": document_type,
            "role": _values(sections, "role", "title", "position"),
            "required_skills": _values(sections, "required", "must_have", "skill", "technology"),
            "preferred_skills": _values(sections, "preferred", "nice_to_have", "bonus"),
            "responsibilities": _values(sections, "responsibil", "duties", "what_you_will_do"),
            "qualifications": _values(sections, "qualif", "education", "experience"),
            "all_sections": {key: list(items) for key, items in sections.items()},
        }
    return {
        "schema_version": "semantic-document-v1",
        "document_type": "resume",
        "contact": _values(sections, "contact", "basic", "personal"),
        "summary": _values(sections, "summary", "profile", "objective"),
        "skills": _values(sections, "skill", "technology", "tool", "competenc"),
        "experience": _values(sections, "experience", "employment", "work", "internship"),
        "projects": _values(sections, "project", "portfolio"),
        "education": _values(sections, "education", "academic"),
        "certifications": _values(sections, "certif", "licen"),
        "all_sections": {key: list(items) for key, items in sections.items()},
    }
