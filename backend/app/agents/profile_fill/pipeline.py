"""
AI-assisted profile fill from resume (agent pipeline).

Steps:
  1) Deterministic parse + section map
  2) NVIDIA structured JSON extraction (when configured)
  3) Evidence filter (drop invented tokens not present in resume text)
  4) Merge AI + deterministic drafts for best coverage
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from app.agents.llm import NvidiaClient
from app.agents.profile_fill.deterministic import build_profile_draft, draft_counts
from app.agents.profile_fill.normalize import normalize_draft
from app.config import Settings
from app.schemas import ProfileResumeExtractResult

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "fill_profile_from_resume_v1.txt"
_MAX_RESUME_CHARS = 28_000


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").casefold()).strip()


def _haystack(plain_text: str) -> str:
    return f" {_norm(plain_text)} "


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text or "")


def _supported_in_resume(value: str | None, haystack: str, *, min_len: int = 3) -> bool:
    """True if value appears in resume text (loose token containment)."""
    if not value:
        return False
    needle = _norm(value)
    if len(needle) < min_len:
        return True
    if needle in haystack:
        return True
    # Phones: compare digit sequences
    d_val = _digits(value)
    if len(d_val) >= 8 and d_val in re.sub(r"\D", "", haystack):
        return True
    # Multi-word: require majority of significant tokens (not all — handles minor rephrasing)
    tokens = [t for t in re.split(r"[^a-z0-9+#.]+", needle) if len(t) >= 3]
    if not tokens:
        return needle in haystack
    hits = sum(1 for t in tokens if t in haystack)
    if len(tokens) == 1:
        return hits == 1
    return hits >= max(1, int(len(tokens) * 0.6))


def _llm_to_draft(result: ProfileResumeExtractResult) -> dict[str, Any]:
    profile = result.profile.model_dump()
    profile["career_goal"] = None
    profile["selected"] = True
    skills = [
        {"name": name.strip(), "source": "resume_ai", "selected": True}
        for name in result.skills
        if isinstance(name, str) and name.strip()
    ]
    experiences = []
    for index, item in enumerate(result.experiences):
        row = item.model_dump()
        row["display_order"] = index
        row["selected"] = True
        experiences.append(row)
    education = []
    for index, item in enumerate(result.education):
        row = item.model_dump()
        row["display_order"] = index
        row["selected"] = True
        education.append(row)
    projects = []
    for index, item in enumerate(result.projects):
        row = item.model_dump()
        row["skills"] = []
        row["display_order"] = index
        row["selected"] = True
        projects.append(row)
    certifications = [{**item.model_dump(), "selected": True} for item in result.certifications]
    languages = [{**item.model_dump(), "selected": True} for item in result.languages]
    links = [{**item.model_dump(), "selected": True} for item in result.links]
    return {
        "profile": profile,
        "skills": skills,
        "experiences": experiences,
        "education": education,
        "projects": projects,
        "certifications": certifications,
        "languages": languages,
        "links": links,
        "meta": {
            "warnings": list(result.warnings or []),
            "method": "ai_structured_profile_extract_v1",
            "ai_used": True,
        },
    }


def _filter_draft_by_evidence(draft: dict[str, Any], plain_text: str) -> dict[str, Any]:
    """Drop AI fields that cannot be grounded in resume text (lenient for paraphrased bio/headline)."""
    hay = _haystack(plain_text)
    out = {
        "profile": dict(draft.get("profile") or {}),
        "skills": [],
        "experiences": [],
        "education": [],
        "projects": [],
        "certifications": [],
        "languages": [],
        "links": [],
        "meta": dict(draft.get("meta") or {}),
    }
    warnings = list(out["meta"].get("warnings") or [])
    profile = out["profile"]

    # Hard-check identity/contact; soft-check narrative fields
    for key in ("full_name", "phone", "location", "current_role"):
        val = profile.get(key)
        if val and not _supported_in_resume(str(val), hay, min_len=2 if key in {"phone", "full_name"} else 3):
            profile[key] = None
            warnings.append(f"Dropped unsupported {key} from AI extract (not found in resume text).")

    for key in ("headline", "bio"):
        val = profile.get(key)
        if not val:
            continue
        tokens = [t for t in re.split(r"[^a-z0-9]+", _norm(str(val))) if len(t) >= 4]
        if tokens and sum(1 for t in tokens[:15] if t in hay) < max(1, min(2, len(tokens) // 4)):
            # Keep mildly paraphrased summary if at least one strong token hits
            if not any(t in hay for t in tokens[:10]):
                profile[key] = None
                warnings.append(f"Dropped unsupported {key} from AI extract.")

    for skill in draft.get("skills") or []:
        name = str(skill.get("name") or "").strip()
        if name and _supported_in_resume(name, hay, min_len=2):
            out["skills"].append({**skill, "name": name, "selected": True})

    for exp in draft.get("experiences") or []:
        company = str(exp.get("company_name") or "").strip()
        role = str(exp.get("role_title") or "").strip()
        if not role:
            continue
        if not company:
            company = "Not specified"
        company_ok = company.lower() in {"not specified", "n/a", "na"} or _supported_in_resume(
            company, hay, min_len=2
        )
        role_ok = _supported_in_resume(role, hay, min_len=3)
        if company_ok or role_ok:
            out["experiences"].append({**exp, "company_name": company, "role_title": role, "selected": True})

    for edu in draft.get("education") or []:
        inst = str(edu.get("institution") or "").strip()
        degree = str(edu.get("degree") or "").strip()
        if not inst and not degree:
            continue
        if (inst and _supported_in_resume(inst, hay, min_len=3)) or (
            degree and _supported_in_resume(degree, hay, min_len=2)
        ):
            out["education"].append({**edu, "selected": True})

    for proj in draft.get("projects") or []:
        title = str(proj.get("title") or "").strip()
        if title and _supported_in_resume(title, hay, min_len=2):
            out["projects"].append({**proj, "selected": True})

    for cert in draft.get("certifications") or []:
        name = str(cert.get("name") or "").strip()
        if name and _supported_in_resume(name, hay, min_len=3):
            out["certifications"].append({**cert, "selected": True})

    for lang in draft.get("languages") or []:
        language = str(lang.get("language") or "").strip()
        if language and _supported_in_resume(language, hay, min_len=2):
            out["languages"].append({**lang, "selected": True})

    compact_hay = hay.replace(" ", "")
    for link in draft.get("links") or []:
        url = str(link.get("url") or "").strip()
        if not url:
            continue
        host = re.sub(r"^https?://(www\.)?", "", url.casefold()).split("/")[0]
        if (host and host in compact_hay) or _supported_in_resume(url, hay, min_len=6):
            out["links"].append({**link, "selected": True})

    out["meta"]["warnings"] = warnings
    return out


def _prefer(a: Any, b: Any) -> Any:
    if a is None or (isinstance(a, str) and not str(a).strip()):
        return b
    return a


def _prefer_years(ai_years: Any, base_years: Any, plain_text: str) -> float | None:
    from app.agents.profile_fill.normalize import extract_explicit_years

    explicit = extract_explicit_years(plain_text)
    if explicit is not None:
        return explicit
    for candidate in (ai_years, base_years):
        if candidate is None:
            continue
        try:
            val = float(candidate)
            if 0 <= val <= 50:
                return val
        except (TypeError, ValueError):
            continue
    return None


def merge_profile_drafts(
    base: dict[str, Any],
    ai: dict[str, Any],
    *,
    plain_text: str,
) -> dict[str, Any]:
    """
    Combine deterministic + AI drafts.
    - Contact: prefer non-empty from either (phone/links often better deterministic)
    - Narrative + multi-entry: prefer AI when present, fill gaps from base
    - Always normalize field shapes at the end
    """
    filtered_ai = _filter_draft_by_evidence(ai, plain_text)
    bp = base.get("profile") or {}
    ap = filtered_ai.get("profile") or {}
    profile = {
        "full_name": _prefer(ap.get("full_name"), bp.get("full_name")),
        "headline": _prefer(ap.get("headline"), bp.get("headline")),
        "bio": _prefer(ap.get("bio"), bp.get("bio")),
        "phone": _prefer(bp.get("phone"), ap.get("phone")),  # deterministic phone often cleaner
        "location": _prefer(ap.get("location"), bp.get("location")),
        "current_role": _prefer(ap.get("current_role"), bp.get("current_role")),
        "years_experience": _prefer_years(ap.get("years_experience"), bp.get("years_experience"), plain_text),
        "career_level": _prefer(ap.get("career_level"), bp.get("career_level")),
        "career_goal": bp.get("career_goal"),
        "selected": True,
    }

    def _merge_list(ai_rows: list, base_rows: list, key_fn) -> list:
        if ai_rows:
            seen = {key_fn(row) for row in ai_rows}
            merged = list(ai_rows)
            for row in base_rows:
                k = key_fn(row)
                if k and k not in seen:
                    merged.append(row)
                    seen.add(k)
            return merged
        return list(base_rows)

    skills = _merge_list(
        filtered_ai.get("skills") or [],
        base.get("skills") or [],
        lambda r: _norm(str(r.get("name") or "")),
    )
    experiences = _merge_list(
        filtered_ai.get("experiences") or [],
        base.get("experiences") or [],
        lambda r: (_norm(str(r.get("company_name") or "")), _norm(str(r.get("role_title") or ""))),
    )
    education = _merge_list(
        filtered_ai.get("education") or [],
        base.get("education") or [],
        lambda r: (_norm(str(r.get("institution") or "")), _norm(str(r.get("degree") or ""))),
    )
    projects = _merge_list(
        filtered_ai.get("projects") or [],
        base.get("projects") or [],
        lambda r: _norm(str(r.get("title") or "")),
    )
    certifications = _merge_list(
        filtered_ai.get("certifications") or [],
        base.get("certifications") or [],
        lambda r: _norm(str(r.get("name") or "")),
    )
    languages = _merge_list(
        filtered_ai.get("languages") or [],
        base.get("languages") or [],
        lambda r: _norm(str(r.get("language") or "")),
    )
    # Prefer deterministic links first (regex), then AI
    links = _merge_list(
        base.get("links") or [],
        filtered_ai.get("links") or [],
        lambda r: _norm(str(r.get("url") or "")),
    )

    warnings = []
    warnings.extend((base.get("meta") or {}).get("warnings") or [])
    warnings.extend((filtered_ai.get("meta") or {}).get("warnings") or [])
    warnings.append("AI structured extraction merged with deterministic parsing. Review before applying.")

    draft = {
        "profile": profile,
        "skills": skills[:50],
        "experiences": experiences[:30],
        "education": education[:15],
        "projects": projects[:20],
        "certifications": certifications[:20],
        "languages": languages[:15],
        "links": links[:15],
        "meta": {
            "email_detected": (base.get("meta") or {}).get("email_detected"),
            "method": "ai_plus_deterministic_profile_fill_v1",
            "ai_used": True,
            "warnings": warnings[:30],
        },
    }
    return normalize_draft(draft, resume_text=plain_text)


async def build_profile_draft_enriched(
    plain_text: str,
    structured_content: dict[str, Any] | None,
    settings: Settings,
) -> dict[str, Any]:
    """
    Full fill pipeline: deterministic first, then optional NVIDIA structured agent step.
    Always returns a reviewable draft; never writes to the database.
    """
    base = build_profile_draft(plain_text, structured_content)
    text = (plain_text or "").strip()
    if not text:
        return base

    if not settings.nvidia_configured:
        meta = dict(base.get("meta") or {})
        meta["ai_used"] = False
        meta["method"] = "deterministic_resume_mapping_v1"
        warnings = list(meta.get("warnings") or [])
        warnings.append("AI not configured (NVIDIA_API_KEY / NVIDIA_MODEL); used deterministic mapping only.")
        meta["warnings"] = warnings
        base["meta"] = meta
        return base

    sections = {}
    if isinstance(structured_content, dict):
        sections = structured_content.get("sections") or {}
    clipped = text[:_MAX_RESUME_CHARS]
    prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    client = NvidiaClient(settings)
    try:
        result: ProfileResumeExtractResult = await client.generate_structured(
            system_prompt=prompt,
            user_payload={
                "task": "extract_candidate_profile_from_resume",
                "resume_plain_text": clipped,
                "resume_sections": sections,
                "instructions": "Extract only facts present in the resume. Prefer accurate job/education splits.",
            },
            schema_model=ProfileResumeExtractResult,
            temperature=min(settings.nvidia_temperature, 0.2),
        )
        ai_draft = _llm_to_draft(result)
        merged = merge_profile_drafts(base, ai_draft, plain_text=text)
        meta = dict(merged.get("meta") or {})
        meta["agent"] = "profile_fill"
        meta["provider"] = "nvidia"
        meta["fallback"] = False
        merged["meta"] = meta
        return merged
    except Exception as exc:
        logger.warning("profile_ai_extract_failed error=%s", exc)
        meta = dict(base.get("meta") or {})
        meta["ai_used"] = False
        meta["method"] = "deterministic_resume_mapping_v1"
        meta["agent"] = "profile_fill"
        meta["provider"] = "deterministic"
        meta["fallback"] = True
        warnings = list(meta.get("warnings") or [])
        warnings.append(
            f"AI extraction failed or was unavailable ({type(exc).__name__}); used deterministic mapping. You can retry later."
        )
        meta["warnings"] = warnings
        base["meta"] = meta
        return normalize_draft(base, resume_text=text)


def profile_draft_response_payload(
    draft: dict[str, Any],
    version_meta: dict[str, Any],
) -> dict[str, Any]:
    fields = (draft.get("meta") or {}).get("fields_extracted") or {}
    return {
        "draft": draft,
        "counts": draft_counts(draft),
        "fields_extracted": fields,
        "resume": version_meta,
        "ai_used": bool((draft.get("meta") or {}).get("ai_used")),
        "method": (draft.get("meta") or {}).get("method"),
        "disclaimer": (
            "Review every field before applying. "
            "Extraction maps: name, phone, location, role, years, skills, experience, education, "
            "projects, certifications, languages, and links. AI uses resume text only when configured."
        ),
    }
