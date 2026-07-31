"""
Normalize and clean extracted profile draft fields.

Used after both deterministic and AI extraction so the UI always receives
clean, field-aware values (no 'Location:' prefixes, no 'Languages: Python' skills).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

_LABEL_PREFIX = re.compile(
    r"^(?:location|address|city|phone|mobile|email|e-?mail|name|role|title|"
    r"languages?|frameworks?|tools?|cloud(?:\s*&\s*tools)?|technologies|"
    r"skills?|contact)\s*[:\-–—]\s*",
    re.I,
)
_YEARS_PHRASE = re.compile(
    r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?",
    re.I,
)
_SKILL_JUNK = re.compile(
    r"^(?:languages?|frameworks?|tools?|cloud|technologies|skills?|others?)$",
    re.I,
)
_CAREER_LEVELS = {
    "fresher",
    "entry",
    "junior",
    "mid",
    "mid-level",
    "senior",
    "lead",
    "manager",
    "executive",
}


def strip_field_label(value: str | None) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split()).strip()
    if not text:
        return None
    text = _LABEL_PREFIX.sub("", text).strip()
    return text or None


def clean_skill_name(value: str | None) -> str | None:
    text = strip_field_label(value)
    if not text:
        return None
    # Drop category-only tokens
    if _SKILL_JUNK.match(text):
        return None
    # "Languages: Python" already stripped; also split accidental "Python FastAPI" later
    if len(text) > 60:
        return None
    if text.endswith(":"):
        return None
    return text


def clean_phone(value: str | None) -> str | None:
    if not value:
        return None
    text = strip_field_label(str(value)) or ""
    # Keep digits and leading +
    digits = re.sub(r"[^\d+]", "", text)
    if digits.count("+") > 1:
        digits = digits.replace("+", "")
        digits = "+" + digits
    pure = re.sub(r"\D", "", digits)
    if len(pure) < 8 or len(pure) > 15:
        return None
    return digits[:40] if digits.startswith("+") else pure[:40]


def clean_location(value: str | None) -> str | None:
    text = strip_field_label(value)
    if not text:
        return None
    # Drop trailing contact noise
    text = re.split(r"\||@", text)[0].strip()
    if _EMAIL_LIKE.search(text) or "http" in text.lower():
        return None
    return text[:160] or None


_EMAIL_LIKE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


def clean_name(value: str | None) -> str | None:
    text = strip_field_label(value)
    if not text:
        return None
    # Title-case messy ALL CAPS names carefully
    if text.isupper() and len(text) > 3:
        text = text.title()
    return text[:120]


def normalize_date_value(value: Any) -> str | None:
    """Accept only ISO dates or ISO month values from extraction/manual drafts."""
    text = str(value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}", text):
        text = f"{text}-01"
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return None


def extract_explicit_years(text: str) -> float | None:
    """Prefer phrases like '2+ years of experience' over year-span math."""
    matches = _YEARS_PHRASE.findall(text or "")
    if not matches:
        return None
    values = []
    for m in matches:
        try:
            values.append(float(m))
        except ValueError:
            continue
    if not values:
        return None
    # Use the max stated experience phrase (usually the summary)
    years = max(values)
    if 0 <= years <= 50:
        return years
    return None


def infer_career_level(years: float | None, text: str = "") -> str | None:
    blob = (text or "").casefold()
    for level in ("executive", "manager", "lead", "senior", "mid-level", "mid", "junior", "fresher", "entry"):
        if re.search(rf"\b{re.escape(level)}\b", blob):
            if level == "entry":
                return "fresher"
            if level == "mid-level":
                return "mid"
            return level
    if years is None:
        return None
    if years <= 0:
        return "fresher"
    if years < 2.5:
        return "junior"
    if years < 5:
        return "mid"
    if years < 8:
        return "senior"
    if years < 12:
        return "lead"
    return "manager"


def normalize_skill_list(skills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in skills or []:
        name = clean_skill_name(str(row.get("name") or ""))
        if not name:
            continue
        # Split residual commas
        for part in re.split(r"[,;/|]", name):
            cleaned = clean_skill_name(part)
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append({**row, "name": cleaned, "selected": row.get("selected", True)})
    return out[:50]


def normalize_profile_fields(profile: dict[str, Any], *, resume_text: str = "") -> dict[str, Any]:
    p = dict(profile or {})
    p["full_name"] = clean_name(p.get("full_name"))
    p["headline"] = strip_field_label(p.get("headline"))
    if p.get("headline"):
        p["headline"] = p["headline"][:240]
    p["bio"] = strip_field_label(p.get("bio"))
    if p.get("bio"):
        p["bio"] = p["bio"][:4000]
    p["phone"] = clean_phone(p.get("phone"))
    p["location"] = clean_location(p.get("location"))
    p["current_role"] = strip_field_label(p.get("current_role"))
    if p.get("current_role"):
        p["current_role"] = p["current_role"][:160]

    years = p.get("years_experience")
    explicit = extract_explicit_years(resume_text)
    if explicit is not None:
        years = explicit
    elif years is not None:
        try:
            years = float(years)
            if years < 0 or years > 50:
                years = explicit
        except (TypeError, ValueError):
            years = explicit
    p["years_experience"] = years

    level = strip_field_label(p.get("career_level"))
    if level:
        level_key = level.casefold().replace(" ", "-")
        if level_key in _CAREER_LEVELS:
            p["career_level"] = "fresher" if level_key == "entry" else ("mid" if level_key == "mid-level" else level_key)
        else:
            p["career_level"] = infer_career_level(years, resume_text)
    else:
        p["career_level"] = infer_career_level(years, resume_text)

    p["selected"] = p.get("selected", True) is not False
    return p


def normalize_experiences(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, row in enumerate(rows or []):
        company = strip_field_label(row.get("company_name")) or "Not specified"
        role = strip_field_label(row.get("role_title"))
        if not role:
            continue
        summary = strip_field_label(row.get("summary"))
        # Prefer bullet-style newlines if summary was glued
        if summary:
            summary = re.sub(r"\s+[-–—•]\s+", "\n- ", summary)
            summary = re.sub(r"(?<=[a-z0-9])\s+(?=[A-Z][a-z])", " ", summary)
        out.append(
            {
                **row,
                "company_name": company[:200],
                "role_title": role[:200],
                "location": clean_location(row.get("location")),
                "start_date": normalize_date_value(row.get("start_date")),
                "end_date": None if row.get("is_current") else normalize_date_value(row.get("end_date")),
                "summary": summary[:4000] if summary else None,
                "display_order": row.get("display_order", index),
                "selected": row.get("selected", True) is not False,
            }
        )
    return out


def normalize_education(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, row in enumerate(rows or []):
        institution = strip_field_label(row.get("institution"))
        if not institution:
            continue
        degree = strip_field_label(row.get("degree"))
        field = strip_field_label(row.get("field_of_study"))
        # "Bachelor of Technology in Computer Science"
        if degree and not field:
            m = re.search(r"\bin\s+(.+)$", degree, re.I)
            if m:
                field = m.group(1).strip()
        out.append(
            {
                **row,
                "institution": institution[:200],
                "degree": degree[:160] if degree else None,
                "field_of_study": field[:160] if field else None,
                "grade": strip_field_label(row.get("grade")),
                "description": strip_field_label(row.get("description")),
                "display_order": row.get("display_order", index),
                "selected": row.get("selected", True) is not False,
            }
        )
    return out


def normalize_projects(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, row in enumerate(rows or []):
        title = strip_field_label(row.get("title"))
        if not title:
            continue
        out.append(
            {
                **row,
                "title": title[:200],
                "role": strip_field_label(row.get("role")),
                "description": strip_field_label(row.get("description")),
                "display_order": row.get("display_order", index),
                "selected": row.get("selected", True) is not False,
            }
        )
    return out


def normalize_links(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows or []:
        url = strip_field_label(row.get("url"))
        if not url:
            continue
        url = url.rstrip(").,;")
        if url.startswith("www."):
            url = "https://" + url
        key = url.casefold()
        if key in seen:
            continue
        seen.add(key)
        link_type = str(row.get("link_type") or "other").lower()
        if "linkedin.com" in key:
            link_type = "linkedin"
        elif "github.com" in key:
            link_type = "github"
        elif link_type not in {"linkedin", "github", "portfolio", "website", "other"}:
            link_type = "other"
        out.append({**row, "url": url[:500], "link_type": link_type, "selected": True})
    return out


def normalize_draft(draft: dict[str, Any], *, resume_text: str = "") -> dict[str, Any]:
    """Return a cleaned draft with consistent field shapes for the UI and apply API."""
    text = resume_text or ""
    out = {
        "profile": normalize_profile_fields(draft.get("profile") or {}, resume_text=text),
        "skills": normalize_skill_list(draft.get("skills") or []),
        "experiences": normalize_experiences(draft.get("experiences") or []),
        "education": normalize_education(draft.get("education") or []),
        "projects": normalize_projects(draft.get("projects") or []),
        "certifications": [
            {
                **row,
                "name": strip_field_label(row.get("name")) or "Certification",
                "issuer": strip_field_label(row.get("issuer")),
                "selected": row.get("selected", True) is not False,
            }
            for row in (draft.get("certifications") or [])
            if strip_field_label(row.get("name"))
        ],
        "languages": [
            {
                **row,
                "language": strip_field_label(row.get("language")) or "",
                "proficiency": strip_field_label(row.get("proficiency")),
                "selected": row.get("selected", True) is not False,
            }
            for row in (draft.get("languages") or [])
            if strip_field_label(row.get("language"))
        ],
        "links": normalize_links(draft.get("links") or []),
        "meta": dict(draft.get("meta") or {}),
    }
    # Drop empty language rows
    out["languages"] = [r for r in out["languages"] if r.get("language")]
    # Field coverage summary for UI/debug
    profile = out["profile"]
    covered = [
        key
        for key in (
            "full_name",
            "phone",
            "location",
            "current_role",
            "headline",
            "years_experience",
            "career_level",
        )
        if profile.get(key) not in (None, "")
    ]
    out["meta"]["fields_extracted"] = {
        "profile": covered,
        "skills": len(out["skills"]),
        "experiences": len(out["experiences"]),
        "education": len(out["education"]),
        "projects": len(out["projects"]),
        "certifications": len(out["certifications"]),
        "languages": len(out["languages"]),
        "links": len(out["links"]),
    }
    return out
