"""Deterministic profile draft generation from resume text (no invented facts)."""

from __future__ import annotations

import re
from typing import Any

from app.features.document_parsing.service import extract_sections, extract_skill_candidates
from app.features.profile.agent.normalize import (
    extract_explicit_years,
    infer_career_level,
    normalize_draft,
)

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{3,4}"
)
_URL_RE = re.compile(r"https?://[^\s)|,\]]+|www\.[^\s)|,\]]+", re.I)
_LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s)|,\]]+", re.I)
_GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[^\s)|,\]]+", re.I)
_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_MONTH_NUMBERS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_DATE_TOKEN = rf"(?:{_MONTH}\.?(?:\s*'?)\d{{2,4}}|(?:19|20)\d{{2}}|\d{{1,2}}[/-]\d{{2,4}})"
_DATE_RANGE_RE = re.compile(
    rf"(?P<start>{_DATE_TOKEN})"
    rf"\s*[-–—to]+\s*"
    rf"(?P<end>(?:{_MONTH}\.?\s*'?\d{{2,4}}|(?:19|20)\d{{2}}|\d{{1,2}}[/\-.]\d{{2,4}}"
    rf"|present|current|now|ongoing|till\s+date|to\s+date))",
    re.I,
)
_CLEAN_DATE_RANGE_RE = re.compile(
    rf"(?P<start>{_DATE_TOKEN})\s*(?:-|–|—|\bto\b)\s*"
    rf"(?P<end>{_DATE_TOKEN}|present|current|now|ongoing|till\s+date|to\s+date)",
    re.I,
)
_YEAR_RE = re.compile(r"(?:19|20)\d{2}")
_BULLET_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219•●○▪▸►\*◦‣⁃\-–—]\s*")


def _clean(value: str | None, limit: int = 500) -> str:
    text = " ".join((value or "").split()).strip()
    return text[:limit]


def _section_lines(sections: dict[str, Any], key: str) -> list[str]:
    raw = sections.get(key) or []
    if isinstance(raw, str):
        return [raw] if raw.strip() else []
    if not isinstance(raw, list):
        return []
    lines: list[str] = []
    for item in raw:
        text = str(item).strip()
        if text:
            lines.append(text)
    return lines


def _split_entry_lines(entry: str) -> list[str]:
    return [line.strip() for line in entry.splitlines() if line.strip()]


def _strip_bullet(line: str) -> str:
    return _BULLET_RE.sub("", line).strip()


def _looks_like_name(line: str) -> bool:
    if not line or len(line) > 60:
        return False
    if _EMAIL_RE.search(line) or _URL_RE.search(line):
        return False
    digits = sum(ch.isdigit() for ch in line)
    if digits >= 6:
        return False
    words = [w for w in re.split(r"\s+", line) if w]
    if not (1 <= len(words) <= 5):
        return False
    # Reject obvious headings / locations
    if line.lower() in {"resume", "curriculum vitae", "cv"}:
        return False
    if re.search(
        r"\b(pune|bengaluru|bangalore|hyderabad|mumbai|delhi|chennai|kolkata|"
        r"ahmedabad|noida|gurgaon|remote|india|usa|uk|united states)\b",
        line,
        re.I,
    ):
        return False
    if "," in line and len(words) <= 3:
        # "City, Country" is not a person name
        return False
    return True


def _extract_phone(text: str) -> str | None:
    match = _PHONE_RE.search(text)
    if not match:
        return None
    candidate = match.group(0).strip()
    digits = sum(ch.isdigit() for ch in candidate)
    if digits < 8:
        return None
    return _clean(candidate, 40)


def _date_to_storage(value: str | None) -> str | None:
    """Normalize a resume month/year into a date without claiming day precision."""
    token = _clean(value, 40).lower().replace(".", "")
    if not token or re.fullmatch(r"present|current|now|ongoing|till date|to date", token):
        return None
    year_match = re.search(r"(?:19|20)\d{2}|\d{2}$", token)
    if not year_match:
        return None
    year = int(year_match.group(0))
    if year < 100:
        year += 2000
    if not 1900 <= year <= 2100:
        return None
    month = 1
    month_name = re.match(r"([a-z]+)", token)
    if month_name:
        month = _MONTH_NUMBERS.get(month_name.group(1), 0)
    else:
        numeric = re.match(r"(\d{1,2})[/-]\d{2,4}", token)
        if numeric:
            month = int(numeric.group(1))
    if not 1 <= month <= 12:
        return None
    return f"{year:04d}-{month:02d}-01"


def _parse_experience_entry(entry: str, order: int) -> dict[str, Any] | None:
    lines = _split_entry_lines(entry)
    if not lines:
        return None
    header = lines[0]
    bullets = [_strip_bullet(line) for line in lines[1:] if _BULLET_RE.match(line) or line.startswith("-")]
    body_lines = [_strip_bullet(line) for line in lines[1:] if not (_BULLET_RE.match(line) or line.startswith("-"))]
    # Prefer bullet summary; else remaining body
    summary_parts = bullets or body_lines
    summary = _clean(" ".join(summary_parts), 2000) or None

    role_title = None
    company_name = None
    location = None
    date_source = " ".join(lines[:2])
    is_current = bool(re.search(r"\b(present|current|now|ongoing|till\s+date|to\s+date)\b", date_source, re.I))

    # Patterns: Role | Company | Location | Dates
    if "|" in header:
        parts = [p.strip() for p in header.split("|") if p.strip()]
        if parts:
            role_title = parts[0]
        if len(parts) >= 2:
            # second part may be company or dates
            if _DATE_RANGE_RE.search(parts[1]) or _YEAR_RE.fullmatch(parts[1].strip()):
                company_name = parts[0]
                role_title = parts[0]
            else:
                company_name = parts[1]
        if len(parts) >= 3 and not _DATE_RANGE_RE.search(parts[2]):
            location = parts[2] if not _DATE_RANGE_RE.search(parts[2]) else location
    else:
        at_match = re.search(r"^(?P<role>.+?)\s+(?:at|@)\s+(?P<company>.+)$", header, re.I)
        if at_match:
            role_title = at_match.group("role").strip()
            company_name = at_match.group("company").strip()
            company_name = _DATE_RANGE_RE.sub("", company_name).strip(" -–—|")
        else:
            # Single-line experience like "Built APIs" — use as summary/role
            role_title = _DATE_RANGE_RE.sub("", header).strip(" -–—|") or header
            company_name = "Not specified"

    role_title = _clean(role_title or "Role", 160)
    company_name = _clean(company_name or "Not specified", 160)
    if company_name.lower() in {"present", "current"}:
        company_name = "Not specified"

    range_match = _DATE_RANGE_RE.search(date_source) or _CLEAN_DATE_RANGE_RE.search(date_source)
    start_date = _date_to_storage(range_match.group("start")) if range_match else None
    end_date = _date_to_storage(range_match.group("end")) if range_match else None
    date_note = range_match.group(0) if range_match else None
    if date_note and summary:
        summary = _clean(f"{date_note}. {summary}", 2000)
    elif date_note and not summary:
        summary = _clean(date_note, 2000)

    return {
        "company_name": company_name,
        "role_title": role_title,
        "location": _clean(location, 160) if location else None,
        "employment_type": None,
        "start_date": start_date,
        "end_date": end_date,
        "is_current": is_current or bool(range_match and not end_date),
        "summary": summary,
        "display_order": order,
        "selected": True,
    }


def _parse_education_entry(entry: str, order: int) -> dict[str, Any] | None:
    lines = _split_entry_lines(entry)
    if not lines:
        return None
    header = lines[0]
    rest = " ".join(_strip_bullet(line) for line in lines[1:])
    institution = None
    degree = None
    field_of_study = None
    grade = None

    if "|" in header:
        parts = [p.strip() for p in header.split("|") if p.strip()]
        # Common: Degree Field | Institution | Years
        if parts:
            first = parts[0]
            institution = parts[1] if len(parts) >= 2 and not _DATE_RANGE_RE.search(parts[1]) else parts[0]
            if len(parts) >= 2 and institution == parts[1]:
                degree = first
            elif len(parts) == 1:
                institution = first
            else:
                # Degree might include field
                degree = first
                if len(parts) >= 2:
                    institution = parts[1]
        if len(parts) >= 3 and not _DATE_RANGE_RE.search(parts[2]):
            field_of_study = parts[2]
    else:
        institution = _DATE_RANGE_RE.sub("", header).strip(" -–—|") or header

    grade_match = re.search(r"(?:cgpa|gpa|grade|percentage)\s*[:\-]?\s*([0-9.]+%?(?:/\d+)?)", f"{header} {rest}", re.I)
    if grade_match:
        grade = grade_match.group(1)

    # Try to split "B.Tech Computer Science"
    if degree and not field_of_study:
        field_hit = re.search(
            r"\b(computer science|information technology|data science|electronics|mechanical|ai|ml)\b",
            degree,
            re.I,
        )
        if field_hit:
            field_of_study = field_hit.group(0).title()

    institution = _clean(institution or "Institution", 200)
    return {
        "institution": institution,
        "degree": _clean(degree, 160) if degree else None,
        "field_of_study": _clean(field_of_study, 160) if field_of_study else None,
        "location": None,
        "grade": _clean(grade, 80) if grade else None,
        "description": _clean(rest, 1000) if rest else None,
        "display_order": order,
        "selected": True,
    }


def _parse_project_entry(entry: str, order: int) -> dict[str, Any] | None:
    lines = _split_entry_lines(entry)
    if not lines:
        return None
    header = lines[0]
    title = header
    role = None
    if "|" in header:
        parts = [p.strip() for p in header.split("|") if p.strip()]
        title = parts[0]
        if len(parts) >= 2:
            role = parts[1]
    bullets = [_strip_bullet(line) for line in lines[1:]]
    description = _clean(" ".join(bullets), 2000) if bullets else None
    return {
        "title": _clean(title, 200) or "Project",
        "role": _clean(role, 160) if role else None,
        "description": description,
        "skills": [],
        "display_order": order,
        "selected": True,
    }


def _parse_cert_entry(entry: str) -> dict[str, Any] | None:
    lines = _split_entry_lines(entry)
    if not lines:
        return None
    header = lines[0]
    name = header
    issuer = None
    if "|" in header:
        parts = [p.strip() for p in header.split("|") if p.strip()]
        name = parts[0]
        if len(parts) >= 2 and not re.fullmatch(r"(?:19|20)\d{2}", parts[1]):
            issuer = parts[1]
    return {
        "name": _clean(name, 200) or "Certification",
        "issuer": _clean(issuer, 160) if issuer else None,
        "selected": True,
    }


def _parse_language_line(line: str) -> dict[str, Any] | None:
    text = _strip_bullet(line)
    if not text:
        return None
    # English - Fluent
    parts = re.split(r"[:\-–—|]", text, maxsplit=1)
    language = parts[0].strip()
    proficiency = parts[1].strip() if len(parts) > 1 else None
    if not language or len(language) > 60:
        return None
    return {
        "language": _clean(language, 80),
        "proficiency": _clean(proficiency, 80) if proficiency else None,
        "selected": True,
    }


def _estimate_years(experience_entries: list[dict[str, Any]], text: str) -> float | None:
    # Prefer explicit "2+ years" in summary over calendar-span guesses (span often
    # includes education years and overstates experience).
    explicit = extract_explicit_years(text or "")
    if explicit is not None:
        return explicit
    # Use only years appearing near experience headers / roles when possible
    exp_blob = "\n".join(
        f"{e.get('role_title','')} {e.get('company_name','')} {e.get('summary','')}"
        for e in experience_entries
    )
    years = sorted({int(y) for y in _YEAR_RE.findall(exp_blob) if 1990 <= int(y) <= 2035})
    if len(years) >= 2:
        span = max(years) - min(years)
        if 0 < span <= 40:
            return float(min(span, 30))
    if experience_entries:
        return float(min(max(len(experience_entries), 1), 15))
    return None


def _infer_career_level(years: float | None, text: str = "") -> str | None:
    return infer_career_level(years, text)


def build_profile_draft(
    plain_text: str,
    structured_content: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a reviewable profile draft from resume plain text + optional structured sections.
    Only uses content present in the resume (deterministic heuristics).
    """
    text = plain_text or ""
    structured = structured_content if isinstance(structured_content, dict) else {}
    sections = structured.get("sections") if isinstance(structured.get("sections"), dict) else None
    if not sections:
        sections = extract_sections(text).get("sections") or {}
    unclassified = structured.get("unclassified_blocks") or []
    if not unclassified:
        unclassified = extract_sections(text).get("unclassified_blocks") or []

    contact_lines = _section_lines(sections, "contact")
    summary_lines = _section_lines(sections, "summary")
    skill_lines = _section_lines(sections, "skills")
    experience_lines = _section_lines(sections, "experience")
    education_lines = _section_lines(sections, "education")
    project_lines = _section_lines(sections, "projects")
    cert_lines = _section_lines(sections, "certifications")
    language_lines = _section_lines(sections, "languages")
    link_lines = _section_lines(sections, "links")

    # Contact first (often holds the candidate name after section promotion).
    header_pool = list(contact_lines) + [str(item) for item in unclassified]
    full_blob = "\n".join([text] + header_pool)

    full_name = None
    for line in header_pool:
        first = line.split("\n")[0].strip()
        if _looks_like_name(first):
            full_name = _clean(first, 120)
            break

    phone = _extract_phone(full_blob)
    emails = _EMAIL_RE.findall(full_blob)
    # email is not a profiles column; keep in notes for UI only
    email = emails[0] if emails else None

    location = None
    for line in header_pool + summary_lines:
        if _EMAIL_RE.search(line) or _URL_RE.search(line):
            continue
        # "City, Country" or "Location: City"
        labeled = re.match(r"^(?:location|address|city)\s*[:\-–—]\s*(.+)$", line, re.I)
        if labeled:
            location = _clean(labeled.group(1), 160)
            break
        if re.search(
            r"\b(pune|bengaluru|bangalore|hyderabad|mumbai|delhi|chennai|kolkata|"
            r"noida|gurgaon|remote|india|usa|uk)\b",
            line,
            re.I,
        ):
            if not _looks_like_name(line) or "," in line or "location" in line.lower():
                loc = re.sub(r"^(?:location|address|city)\s*[:\-–—]\s*", "", line, flags=re.I)
                location = _clean(loc, 160)
                break

    headline = _clean(summary_lines[0], 240) if summary_lines else None
    bio = _clean(" ".join(summary_lines), 4000) if summary_lines else None

    experiences: list[dict[str, Any]] = []
    for index, entry in enumerate(experience_lines):
        parsed = _parse_experience_entry(entry, index)
        if parsed:
            experiences.append(parsed)

    current_role = experiences[0]["role_title"] if experiences else None

    educations: list[dict[str, Any]] = []
    for index, entry in enumerate(education_lines):
        parsed = _parse_education_entry(entry, index)
        if parsed:
            educations.append(parsed)

    projects: list[dict[str, Any]] = []
    for index, entry in enumerate(project_lines):
        parsed = _parse_project_entry(entry, index)
        if parsed:
            projects.append(parsed)

    certifications: list[dict[str, Any]] = []
    for entry in cert_lines:
        parsed = _parse_cert_entry(entry)
        if parsed:
            certifications.append(parsed)

    languages: list[dict[str, Any]] = []
    for line in language_lines:
        # languages section may be one comma list
        if "," in line and "|" not in line and line.count(",") >= 1 and len(line) < 120:
            for part in line.split(","):
                parsed = _parse_language_line(part)
                if parsed:
                    languages.append(parsed)
        else:
            parsed = _parse_language_line(line)
            if parsed:
                languages.append(parsed)

    # Skills — strip category labels ("Languages:", "Frameworks:") before splitting
    skill_names: list[str] = []
    seen_skills: set[str] = set()
    for line in skill_lines:
        payload = line
        if ":" in line:
            left, right = line.split(":", 1)
            # Only treat as label if left side is short category text
            if len(left.strip()) <= 40 and not re.search(r"\d", left):
                payload = right
        chunks = re.split(r"[,;|/]|·", payload)
        for chunk in chunks:
            name = _clean(chunk, 80)
            if not name or len(name) < 2:
                continue
            if re.fullmatch(
                r"languages?|frameworks?|tools?|cloud(?:\s*&\s*tools)?|technologies|skills?",
                name,
                re.I,
            ):
                continue
            key = name.lower()
            if key in seen_skills:
                continue
            seen_skills.add(key)
            skill_names.append(name)
    for skill in extract_skill_candidates(text, limit=30):
        key = skill.lower()
        if key not in seen_skills:
            seen_skills.add(key)
            skill_names.append(skill)

    skills = [{"name": name, "source": "resume_import", "selected": True} for name in skill_names[:40]]

    links: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    def add_link(link_type: str, url: str, label: str | None = None) -> None:
        cleaned = url.strip().rstrip(").,;")
        if cleaned.startswith("www."):
            cleaned = "https://" + cleaned
        key = cleaned.lower()
        if key in seen_urls:
            return
        seen_urls.add(key)
        links.append(
            {
                "link_type": link_type,
                "url": cleaned[:500],
                "label": label,
                "selected": True,
            }
        )

    for line in [full_blob, *link_lines]:
        for match in _URL_RE.findall(line):
            lower = match.lower()
            if "linkedin.com" in lower:
                add_link("linkedin", match, "LinkedIn")
            elif "github.com" in lower:
                add_link("github", match, "GitHub")
            else:
                add_link("website", match, None)

    years = _estimate_years(experiences, text)
    career_level = _infer_career_level(years, text)

    profile = {
        "full_name": full_name,
        "headline": headline,
        "bio": bio,
        "phone": phone,
        "location": location,
        "current_role": current_role,
        "years_experience": years,
        "career_level": career_level,
        "career_goal": None,
        "selected": True,
    }

    warnings: list[str] = []
    if not full_name:
        warnings.append("Could not detect a full name; please fill it manually.")
    if not experiences and not skills:
        warnings.append("Little structured content was detected; review the draft carefully.")
    if email:
        warnings.append(f"Email detected ({email}) — stored in account auth, not profile phone fields.")

    draft = {
        "profile": profile,
        "skills": skills,
        "experiences": experiences,
        "education": educations,
        "projects": projects,
        "certifications": certifications,
        "languages": languages,
        "links": links,
        "meta": {
            "email_detected": email,
            "method": "deterministic_resume_mapping_v1",
            "warnings": warnings,
            "ai_used": False,
        },
    }
    return normalize_draft(draft, resume_text=text)


def draft_counts(draft: dict[str, Any]) -> dict[str, int]:
    return {
        "skills": len(draft.get("skills") or []),
        "experiences": len(draft.get("experiences") or []),
        "education": len(draft.get("education") or []),
        "projects": len(draft.get("projects") or []),
        "certifications": len(draft.get("certifications") or []),
        "languages": len(draft.get("languages") or []),
        "links": len(draft.get("links") or []),
    }
