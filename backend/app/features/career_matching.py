
from __future__ import annotations

import re
from typing import Any

ALGORITHM_VERSION = "evidence-keyword-match-v1"
KNOWN_RESOURCE_URLS = {
    "python": ("Python documentation", "documentation", "https://docs.python.org/3/"),
    "javascript": ("MDN JavaScript guide", "documentation", "https://developer.mozilla.org/en-US/docs/Web/JavaScript"),
    "typescript": ("TypeScript handbook", "documentation", "https://www.typescriptlang.org/docs/handbook/intro.html"),
    "react": ("React documentation", "documentation", "https://react.dev/learn"),
    "sql": ("PostgreSQL documentation", "documentation", "https://www.postgresql.org/docs/"),
    "fastapi": ("FastAPI documentation", "documentation", "https://fastapi.tiangolo.com/"),
    "docker": ("Docker documentation", "documentation", "https://docs.docker.com/get-started/"),
    "git": ("Git documentation", "documentation", "https://git-scm.com/doc"),
    "machine learning": ("scikit-learn user guide", "documentation", "https://scikit-learn.org/stable/user_guide.html"),
    "deep learning": ("PyTorch tutorials", "documentation", "https://pytorch.org/tutorials/"),
    "nlp": ("Hugging Face NLP course", "course", "https://huggingface.co/learn/nlp-course/chapter1/1"),
}
def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_text(item) for item in value.values())
    return ""
def _normal(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace(".js", " js ").strip())


def _phrase_present(phrase: str, haystack: str) -> bool:
    """True when phrase appears as a token/phrase boundary match (not a substring of a longer word).

    Prevents ``java`` matching inside ``javascript``.
    """
    phrase = _normal(phrase)
    haystack = _normal(haystack)
    if not phrase or not haystack:
        return False
    # Multi-word: require contiguous phrase with non-alnum boundaries.
    pattern = r"(?<![a-z0-9+#])" + re.escape(phrase).replace(r"\ ", r"\s+") + r"(?![a-z0-9+#])"
    return re.search(pattern, haystack) is not None


def _token_present(token: str, haystack: str) -> bool:
    token = _normal(token)
    if not token:
        return False
    return _phrase_present(token, haystack)


def candidate_skill_evidence(client, user_id: str, resume: dict[str, Any], version: dict[str, Any]) -> tuple[set[str], str]:
    """Build skill names + free-text evidence from the **confirmed resume version** only.

    Profile-level candidate_skills are included only when the skill phrase also
    appears in the confirmed resume evidence (golden rule: no invented skills).
    """
    structured = version.get("structured_content") or {}
    sections = structured.get("sections") if isinstance(structured, dict) else {}
    skill_lines = []
    if isinstance(sections, dict):
        for key, value in sections.items():
            if "skill" in str(key).lower():
                skill_lines.append(_text(value))
    resume_text = _text(version.get("plain_text")) or _text(resume.get("plain_text"))
    evidence_text = " ".join([resume_text, *skill_lines])
    explicit: set[str] = set()
    if evidence_text:
        explicit.update(
            _normal(token)
            for line in skill_lines
            for token in re.split(r"[,|;\n]", line)
            if token.strip()
        )
    # Profile skills may boost only when grounded in confirmed resume text.
    rows = client.table("candidate_skills").select("name,normalized_name").eq("user_id", user_id).execute().data or []
    for row in rows:
        name = _normal(str(row.get("normalized_name") or row.get("name") or ""))
        if name and _phrase_present(name, evidence_text):
            explicit.add(name)
    return {item for item in explicit if item}, evidence_text


def _requirements(job: dict[str, Any]) -> list[str]:
    value = job.get("requirements") or []
    if isinstance(value, str):
        try:
            import json
            value = json.loads(value)
        except (TypeError, ValueError):
            value = [value]
    if not isinstance(value, list):
        value = []
    items = [str(item).strip() for item in value if str(item).strip()]
    # Fallback: pull tech-looking tokens from description when requirements empty
    # (common for Adzuna-synced jobs that only store free-text description).
    if not items:
        description = str(job.get("description") or "")
        if description:
            items = _extract_requirement_phrases(description)
    return items


# Common tech tokens used when scraping free-text job descriptions for requirements.
_KNOWN_JOB_TERMS = (
    "python", "javascript", "typescript", "java", "kotlin", "swift", "rust", "go",
    "react", "angular", "vue", "node.js", "nodejs", "fastapi", "django", "flask",
    "aws", "azure", "gcp", "docker", "kubernetes", "k8s", "sql", "postgresql",
    "mongodb", "redis", "graphql", "terraform", "linux", "git", "ci/cd",
    "machine learning", "deep learning", "pytorch", "tensorflow", "spark",
)


def _extract_requirement_phrases(description: str, limit: int = 24) -> list[str]:
    """Extract known tech phrases from free-text job description for ranking."""
    haystack = _normal(description)
    found: list[str] = []
    for term in sorted(_KNOWN_JOB_TERMS, key=len, reverse=True):
        if _phrase_present(term, haystack) and term not in found:
            found.append(term)
        if len(found) >= limit:
            break
    return found


def _infer_work_mode(job: dict[str, Any]) -> str | None:
    """Derive remote/hybrid/onsite from explicit field or description text."""
    explicit = str(job.get("work_mode") or "").strip()
    if explicit:
        return explicit
    blob = _normal(f"{job.get('description') or ''} {job.get('location') or ''} {job.get('title') or ''}")
    if re.search(r"\bremote\b|\bwork from home\b|\bwfh\b", blob):
        return "remote"
    if re.search(r"\bhybrid\b", blob):
        return "hybrid"
    if re.search(r"\bonsite\b|\bon-site\b|\bin office\b|\bin-office\b", blob):
        return "onsite"
    return None


def score_job(job: dict[str, Any], skill_names: set[str], evidence_text: str) -> dict[str, Any]:
    requirements = _requirements(job)
    matched = [
        item
        for item in requirements
        if _normal(item) in skill_names or _phrase_present(item, evidence_text)
    ]
    missing = [item for item in requirements if item not in matched]
    title = str(job.get("title") or "")
    title_terms = [term for term in re.findall(r"[a-zA-Z][a-zA-Z+#.-]{2,}", title.lower())]
    role_hits = sum(1 for term in title_terms if _token_present(term, evidence_text))
    if requirements:
        score = round((len(matched) / len(requirements)) * 80 + min(role_hits, 4) * 5, 1)
    else:
        score = round(min(role_hits * 12, 40), 1)
    return {
        "job": job,
        "match_score": score,
        "match_breakdown": {
            "matched_requirements": matched,
            "missing_requirements": missing,
            "requirements_count": len(requirements),
            "role_evidence_hits": role_hits,
        },
        "evidence": {
            "source": "confirmed resume text (profile skills only if grounded in resume)",
            "matched_terms": matched,
            "note": "Missing terms mean they were not found in the selected resume evidence.",
        },
    }
def build_learning_items(evidence_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps: list[str] = []
    for row in evidence_rows:
        if row.get("match_status") in {"not_found", "partial_match"}:
            term = str(row.get("requirement_text") or "").strip()
            if term and term.lower() not in {item.lower() for item in gaps}:
                gaps.append(term)
    items = []
    for position, gap in enumerate(gaps[:12], start=1):
        key = _normal(gap)
        resource = KNOWN_RESOURCE_URLS.get(key)
        metadata = {"source": "ats_evidence", "requirement": gap, "algorithm_version": ALGORITHM_VERSION}
        resources = []
        if resource:
            resources.append({
                "title": resource[0], "resource_type": resource[1], "provider": resource[0].split()[0],
                "url": resource[2], "reason_recommended": f"Reference for the identified gap: {gap}.", "metadata": metadata,
            })
        items.append({
            "position": position,
            "title": f"Build evidence for {gap}",
            "objective": f"Study and practise {gap}, then add truthful resume evidence if you gain that experience.",
            "item_type": "skill_gap",
            "difficulty": "foundational" if position <= 4 else "applied",
            "estimated_minutes": 90,
            "metadata": metadata,
            "resources": resources,
        })
    return items
def progress_percentage(items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    return round(sum(item.get("status") == "completed" for item in items) / len(items) * 100)
