"""
Section boundary parser for resumes and job descriptions.

Design principles:
  - Source-true: only assigns text that appears in the document.
  - Heading-driven: content stays under the last recognised heading until the next.
  - No LLM here: avoids hallucinated section placement.
  - Prefer precise multi-word aliases over ambiguous single words (no bare "work").
"""

from __future__ import annotations

import re
from typing import Any

# Canonical section → accepted heading phrases (normalized lowercase, no punctuation).
# Keep multi-word where possible to avoid false positives.
HEADING_ALIASES: dict[str, frozenset[str]] = {
    "contact": frozenset(
        {
            "contact",
            "contact details",
            "contact information",
            "personal information",
            "personal details",
            "personal info",
        }
    ),
    "summary": frozenset(
        {
            "summary",
            "profile",
            "objective",
            "professional summary",
            "career summary",
            "executive summary",
            "professional profile",
            "career objective",
            "about me",
            "overview",
            "professional overview",
            "career profile",
        }
    ),
    "skills": frozenset(
        {
            "skills",
            "technical skills",
            "core skills",
            "key skills",
            "skill set",
            "skillset",
            "competencies",
            "core competencies",
            "technical competencies",
            "technologies",
            "tech stack",
            "tools technologies",
            "skills technologies",
            "skills and technologies",
            "skills & technologies",
            "technical proficiencies",
            "areas of expertise",
            "technical expertise",
            "skills summary",
            "key competencies",
            "professional skills",
        }
    ),
    "experience": frozenset(
        {
            "experience",
            "work experience",
            "professional experience",
            "employment",
            "employment history",
            "work history",
            "career history",
            "professional background",
            "relevant experience",
            "professional history",
            "internship experience",
            "internships",
            "work experience details",
        }
    ),
    "projects": frozenset(
        {
            "projects",
            "project experience",
            "personal projects",
            "academic projects",
            "key projects",
            "selected projects",
            "project work",
            "notable projects",
            "side projects",
            "portfolio projects",
            "major projects",
            "relevant projects",
            "project highlights",
        }
    ),
    "education": frozenset(
        {
            "education",
            "academic background",
            "academic qualifications",
            "academics",
            "educational background",
            "education qualifications",
            "educational qualifications",
            "academic history",
            "degrees",
            "education and training",
        }
    ),
    "certifications": frozenset(
        {
            "certifications",
            "certificates",
            "licenses",
            "licenses and certifications",
            "professional certifications",
            "certification",
            "courses and certifications",
            "trainings and certifications",
        }
    ),
    "courses": frozenset({"courses", "relevant courses", "coursework", "training"}),
    "languages": frozenset(
        {
            "languages",
            "language proficiency",
            "spoken languages",
            "language skills",
        }
    ),
    "links": frozenset(
        {
            "links",
            "online profiles",
            "social links",
            "websites",
            "web profiles",
        }
    ),
    "achievements": frozenset(
        {
            "achievements",
            "accomplishments",
            "awards",
            "honors",
            "awards and achievements",
            "honors and awards",
            "key achievements",
        }
    ),
    # Job description sections
    "responsibilities": frozenset(
        {
            "responsibilities",
            "key responsibilities",
            "duties",
            "what you will do",
            "role responsibilities",
            "job responsibilities",
            "day to day responsibilities",
        }
    ),
    "requirements": frozenset(
        {
            "requirements",
            "required qualifications",
            "must have",
            "must haves",
            "minimum qualifications",
            "required skills",
            "basic qualifications",
            "essential requirements",
            "what we look for",
            "job requirements",
            "qualifications",
        }
    ),
    "preferred_qualifications": frozenset(
        {
            "preferred qualifications",
            "preferred skills",
            "nice to have",
            "nice to haves",
            "good to have",
            "bonus skills",
            "desired skills",
            "additional qualifications",
            "preferred requirements",
        }
    ),
    "company_description": frozenset(
        {
            "about the company",
            "about us",
            "company overview",
            "company description",
        }
    ),
    "benefits": frozenset({"benefits", "what we offer", "perks and benefits", "employee benefits"}),
    "legal": frozenset(
        {
            "equal opportunity",
            "equal employment opportunity",
            "eeo statement",
            "work authorization",
            "legal information",
        }
    ),
}

# Longest aliases first so "professional experience" wins over "experience".
_HEADING_LOOKUP: list[tuple[str, str]] = sorted(
    ((alias, key) for key, aliases in HEADING_ALIASES.items() for alias in aliases),
    key=lambda item: (-len(item[0]), item[0]),
)

_BULLET_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219•●○▪▸►\*◦‣⁃\-–—]\s+")
_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_DATE_RANGE_RE = re.compile(
    rf"(?:"
    rf"{_MONTH}\.?\s*'?\d{{2,4}}"
    rf"|(?:19|20)\d{{2}}"
    rf"|\d{{1,2}}[/\-.]\d{{2,4}}"
    rf")"
    rf"\s*[-–—to]+\s*"
    rf"(?:"
    rf"{_MONTH}\.?\s*'?\d{{2,4}}"
    rf"|(?:19|20)\d{{2}}"
    rf"|\d{{1,2}}[/\-.]\d{{2,4}}"
    rf"|present|current|now|ongoing|till\s+date|to\s+date"
    rf")",
    re.I,
)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{3,4}")
_URL_RE = re.compile(r"https?://\S+|www\.\S+|(?:linkedin|github)\.com/\S+", re.I)
_ENTRY_SECTIONS = frozenset({"experience", "projects", "education", "certifications", "achievements"})
# Sections that must never absorb content after a different major heading without switching
_MAJOR_SECTIONS = frozenset(
    {"summary", "skills", "experience", "projects", "education", "certifications", "languages"}
)


def _normalize_heading_label(line: str) -> str:
    cleaned = line.strip()
    # Markdown / list prefixes
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned)
    cleaned = re.sub(r"^[\d]+[\.\)\-:]\s*", "", cleaned)
    cleaned = cleaned.rstrip(":").strip()
    cleaned = re.sub(r"[^a-z0-9\s&/+]", " ", cleaned.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _looks_like_heading_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 90:
        return False
    if _BULLET_RE.match(stripped):
        return False
    if _EMAIL_RE.search(stripped) or _URL_RE.search(stripped):
        return False
    if stripped.endswith(".") and len(stripped.split()) > 4:
        return False
    if stripped.count(",") >= 3:
        return False
    if len(stripped.split()) > 10:
        return False
    return True


def match_section_heading(line: str) -> str | None:
    """
    Return canonical section key if this line is a known resume/JD heading.
    Exact alias match is preferred; short ambiguous words are not used alone
    in the alias table for high-risk sections.
    """
    normalized = _normalize_heading_label(line)
    if not normalized:
        return None

    # Exact match: allow slightly looser length if it is a pure known heading
    for alias, key in _HEADING_LOOKUP:
        if normalized == alias:
            if len(line.strip()) <= 100 and not _BULLET_RE.match(line.strip()):
                if _EMAIL_RE.search(line) or _URL_RE.search(line):
                    return None
                return key

    if not _looks_like_heading_line(line):
        return None

    without_parens = re.sub(r"\([^)]*\)", "", normalized).strip()
    without_parens = re.sub(r"\s+", " ", without_parens)
    if without_parens and without_parens != normalized:
        for alias, key in _HEADING_LOOKUP:
            if without_parens == alias:
                return key

    # "SECTION NAME - details" only if left side is exact alias and short
    for sep in (" - ", " – ", " — ", " | "):
        if sep in normalized:
            left = normalized.split(sep, 1)[0].strip()
            for alias, key in _HEADING_LOOKUP:
                if left == alias:
                    return key
    return None


def _is_contact_line(line: str) -> bool:
    if _EMAIL_RE.search(line) or _URL_RE.search(line):
        return True
    digits = sum(ch.isdigit() for ch in line)
    if digits >= 8 and _PHONE_RE.search(line):
        return True
    return False


def _is_bullet_line(line: str) -> bool:
    return bool(_BULLET_RE.match(line.strip()))


def _is_entry_start(line: str, section: str) -> bool:
    if section not in _ENTRY_SECTIONS:
        return False
    stripped = line.strip()
    if not stripped or _is_bullet_line(stripped):
        return False
    if _DATE_RANGE_RE.search(stripped):
        return True
    if stripped.count("|") >= 1 and len(stripped) <= 140 and not stripped.endswith("."):
        return True
    if re.search(r"\s+(?:at|@)\s+", stripped, re.I) and len(stripped) <= 120:
        return True
    if re.search(r"\s[-–—]\s", stripped) and len(stripped) <= 120 and not stripped.endswith("."):
        if len(stripped.split()) <= 14:
            return True
    return False


def _group_section_entries(section: str, lines: list[str]) -> list[str]:
    if not lines:
        return []
    if section not in _ENTRY_SECTIONS:
        if section == "skills":
            return _normalize_skill_lines(lines)
        return [line for line in lines if line.strip()]

    entries: list[str] = []
    current: list[str] = []

    def flush() -> None:
        nonlocal current
        if current:
            entries.append("\n".join(current).strip())
            current = []

    for line in lines:
        if not line.strip():
            flush()
            continue
        stripped = line.strip()
        if current and _is_entry_start(stripped, section) and not _is_bullet_line(stripped):
            prior_has_body = any(_is_bullet_line(item) for item in current)
            prior_is_header = _is_entry_start(current[0], section) or bool(_DATE_RANGE_RE.search(current[0]))
            if prior_has_body or prior_is_header:
                if prior_has_body or _DATE_RANGE_RE.search(stripped) or "|" in stripped:
                    flush()
        current.append(stripped)
    flush()
    return entries


def _normalize_skill_lines(lines: list[str]) -> list[str]:
    """Expand skill lines into clean tokens; strip category labels."""
    result: list[str] = []
    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        payload = stripped
        if ":" in stripped:
            left, right = stripped.split(":", 1)
            if len(left.strip()) <= 40 and not re.search(r"\d", left):
                payload = right
        parts = [p.strip() for p in re.split(r"[,;|/]|·", payload) if p.strip()]
        if len(parts) >= 2:
            for part in parts:
                key = part.casefold()
                if key in seen or len(part) < 2:
                    continue
                if re.fullmatch(r"languages?|frameworks?|tools?|technologies|skills?", part, re.I):
                    continue
                seen.add(key)
                result.append(part)
            continue
        key = stripped.casefold()
        if key not in seen:
            seen.add(key)
            result.append(stripped)
    return result


def extract_sections(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    """
    Parse resume/JD plain text into canonical sections with strict heading boundaries.

    Content after a heading belongs only to that section until the next heading.
    Skills never receive project/experience lines once those headings are found.
    """
    raw_sections: dict[str, list[str]] = {}
    unclassified: list[str] = []
    current: str | None = None
    pending_blank = False
    seen_headings: list[str] = []

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        # Keep markdown heading markers stripped for matching but store clean text
        if not line:
            if current and current in _ENTRY_SECTIONS and raw_sections.get(current):
                pending_blank = True
            continue

        heading = match_section_heading(line)
        if heading:
            current = heading
            raw_sections.setdefault(current, [])
            if heading not in seen_headings:
                seen_headings.append(heading)
            pending_blank = False
            continue

        if current is None and _is_contact_line(line):
            raw_sections.setdefault("contact", []).append(line)
            continue

        if current is None:
            if not unclassified and len(line) <= 80 and not line.endswith("."):
                unclassified.append(line)
            elif _is_contact_line(line):
                raw_sections.setdefault("contact", []).append(line)
            else:
                unclassified.append(line)
            continue

        if pending_blank:
            if raw_sections[current] and raw_sections[current][-1] != "":
                raw_sections[current].append("")
            pending_blank = False

        raw_sections[current].append(line)

    if unclassified and "contact" in raw_sections:
        name_candidate = unclassified[0]
        if len(name_candidate) <= 60 and not _is_contact_line(name_candidate):
            raw_sections["contact"].insert(0, name_candidate)
            unclassified = unclassified[1:]

    sections: dict[str, list[str]] = {}
    for key, lines in raw_sections.items():
        cleaned = [line for line in lines if line is not None]
        grouped = _group_section_entries(key, cleaned)
        if key in {"requirements", "preferred_qualifications"}:
            negated = [
                line
                for line in grouped
                if re.search(
                    r"\b(?:no|not|without)\b.*\b(?:required|needed|necessary)\b", line, re.I
                )
            ]
            if negated:
                grouped = [line for line in grouped if line not in negated]
                unclassified.extend(negated)
        if grouped:
            sections[key] = grouped

    warnings: list[str] = []
    if not sections:
        warnings.append("No recognised section headings were found; review all extracted text.")
    else:
        if (
            schema_version.startswith("resume")
            and "experience" not in sections
            and "projects" not in sections
        ):
            warnings.append("No professional experience or projects section was detected.")
        # Cross-check: if both skills and projects exist, ensure no shared first lines
        if "skills" in sections and "projects" in sections:
            skill_set = {re.sub(r"\s+", " ", s.casefold()) for s in sections["skills"]}
            for proj in sections["projects"]:
                first = proj.splitlines()[0].strip().casefold() if proj else ""
                if first and first in skill_set:
                    warnings.append(
                        "A project title also appears under skills; verify section headings "
                        "in the source file."
                    )
                    break

    return {
        "schema_version": schema_version,
        "sections": sections,
        "unclassified_blocks": unclassified,
        "warnings": warnings,
        "corrections": {},
        "detected_headings": seen_headings,
    }
