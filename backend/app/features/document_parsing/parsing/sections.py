
from __future__ import annotations

from typing import Any

from app.features.document_parsing.parsing.llm_sections import (
    _looks_like_heading,
    _slug_kind,
    extract_sections_structural,
)

HEADING_ALIASES: dict[str, frozenset[str]] = {
    "contact": frozenset({"contact", "personal_details", "personal_information"}),
    "summary": frozenset({"summary", "profile", "professional_summary", "about_me"}),
    "skills": frozenset({"skills", "technical_skills", "core_competencies", "technologies", "tech_stack"}),
    "experience": frozenset({"experience", "work_experience", "professional_experience", "employment", "work_history"}),
    "education": frozenset({"education", "academic_background", "qualifications"}),
    "projects": frozenset({"projects", "personal_projects", "academic_projects"}),
    "certifications": frozenset({"certifications", "certificates", "licenses"}),
    "languages": frozenset({"languages", "spoken_languages"}),
    "links": frozenset({"links", "profiles", "online_profiles"}),
}


def canonical_section_key(value: str) -> str:
    key = value.strip().casefold()
    for canonical, aliases in HEADING_ALIASES.items():
        if key == canonical or key in aliases:
            return canonical
    return key
def match_section_heading(line: str) -> str | None:
    if not _looks_like_heading(line):
        return None
    return _slug_kind(line.rstrip(":").strip())
def extract_sections(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    raw = extract_sections_structural(text, schema_version)
    canonical: dict[str, list[Any]] = {}
    for key, lines in raw.items():
        canonical.setdefault(canonical_section_key(key), []).extend(lines or [])
    return canonical
