
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

ALGORITHM_VERSION = "evidence-keyword-coverage-v3"
EVIDENCE_MATCH_STATUS = {
    "strong": "strong_match",
    "partial": "partial_match",
    "missing": "not_found",
}
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9+#./-]*")
SHORT_TECH_TERMS = {"ai", "bi", "go", "ml", "r", "ui", "ux", "js", "ts", "c", "c++", "c#"}
STOP_WORDS = {
    "about", "also", "and", "are", "been", "being", "candidate", "company",
    "description", "excellent", "experience", "familiarity", "for", "from",
    "have", "ideal", "including", "job", "knowledge", "must", "need", "our",
    "preferred", "required", "requirements", "responsibilities", "role", "should",
    "skills", "strong", "team", "that", "the", "their", "this", "using", "with",
    "work", "years", "you", "your", "will", "within", "ability", "looking", "join",
    "etc", "such", "well", "good", "plus", "we", "a", "an", "be", "can", "could",
    "would", "person", "people", "value", "collaborative", "motivated", "passionate",
}
# Section-label patterns only — bare substring markers (e.g. "bonus" in "bonus culture")
# must not flip weight for following requirement lines.
PREFERRED_SECTION_RE = re.compile(
    r"(?i)^\s*(?:preferred|nice\s*to\s*have|nice-to-have|desired)\b"
    r"|^\s*(?:bonus|plus)\s*:"
)
REQUIRED_SECTION_RE = re.compile(
    r"(?i)^\s*(?:required|must\s*have|must-have|minimum|qualifications|requirements)\b"
)
# Exit multi-line requirement blocks when these non-skill sections begin.
JD_SECTION_EXIT_RE = re.compile(
    r"(?i)^\s*(?:about\s+(?:us|the\s+company)|benefits|what\s+we\s+offer|culture|"
    r"equal\s+opportunity|how\s+to\s+apply|location|compensation|salary)\b"
)
PREFERRED_MARKERS = ("preferred", "nice to have", "nice-to-have", "desired")
REQUIRED_MARKERS = ("required", "must have", "must-have", "minimum", "qualifications")
ALIAS_GROUPS: dict[str, tuple[str, ...]] = {
    "javascript": ("javascript", "js"),
    "typescript": ("typescript", "ts"),
    "node.js": ("node.js", "nodejs", "node js"),
    "postgresql": ("postgresql", "postgres", "postgre sql"),
    "kubernetes": ("kubernetes", "k8s"),
    "machine learning": ("machine learning", "ml"),
    "artificial intelligence": ("artificial intelligence", "ai"),
    "ci/cd": ("ci/cd", "ci cd", "continuous integration", "continuous delivery"),
    "rest api": ("rest api", "rest apis", "restful api", "restful apis"),
    "api": ("api", "apis"),
    "llm": ("llm", "llms", "large language model", "large language models"),
    "rag": ("rag", "retrieval augmented generation", "retrieval-augmented generation"),
}
ALIAS_TO_CANONICAL = {
    alias: canonical
    for canonical, aliases in ALIAS_GROUPS.items()
    for alias in aliases
}
KNOWN_TECH_TERMS = {
    "aws", "azure", "gcp", "fastapi", "flask", "django", "java", "kotlin", "swift", "rust",
    "python", "php", "ruby", "scala", "c++", "c#", "sql", "nosql", "mysql", "mongodb",
    "redis", "graphql", "html", "css", "tailwind", "next.js", "react", "react native",
    "angular", "vue", "spring", "git", "github", "gitlab", "linux", "terraform", "jenkins",
    "figma", "pandas", "numpy", "pytorch", "tensorflow", "spark", "hadoop", "airflow",
    "snowflake", "databricks", "tableau", "power bi", "excel", "selenium", "playwright",
}
RELEVANT_LINE_MARKERS = (
    "required", "must have", "qualifications", "requirements", "skills", "technologies",
    "technical", "responsibilities", "experience with", "proficient", "preferred", "nice to have",
)
@dataclass(frozen=True)
class AtsEvidenceItem:
    requirement: str
    matched: bool
    resume_evidence: str | None
    resume_section: str | None
    score_contribution: float
    explanation: str
    requirement_type: str = "required"
    priority: str = "critical"
    match_strength: str = "missing"
    suggested_section: str = "skills"
    matched_alias: str | None = None
@dataclass(frozen=True)
class AtsScore:
    overall_score: float
    matched_terms: list[str]
    missing_terms: list[str]
    evidence: list[AtsEvidenceItem]
    partial_terms: list[str] | None = None
    required_score: float = 0.0
    preferred_score: float = 0.0
    section_summary: dict[str, list[str]] | None = None
    @property
    def breakdown(self) -> dict[str, object]:
        partial = self.partial_terms or []
        return {
            "method": "keyword_coverage",
            "algorithm_version": ALGORITHM_VERSION,
            "matched_count": len(self.matched_terms),
            "partial_count": len(partial),
            "missing_count": len(self.missing_terms),
            "total_terms": len(self.evidence),
            "matched_terms": self.matched_terms,
            "partial_terms": partial,
            "missing_terms": self.missing_terms,
            "required_score": self.required_score,
            "preferred_score": self.preferred_score,
            "section_summary": self.section_summary or {},
            "keyword_coverage_score": self.overall_score,
            "truthfulness": (
                "Score and evidence use only confirmed resume/JD text. "
                "resume_evidence is always an exact quote from the resume source."
            ),
        }
def evidence_match_status(match_strength: str) -> str:
    return EVIDENCE_MATCH_STATUS.get(match_strength, "unverified")


def ats_source_fingerprint(
    resume_plain_text: str | None,
    structured_content: Any,
    job_raw_text: str | None,
    *,
    resume_confirmed_at: str | None = None,
    job_confirmed_at: str | None = None,
) -> str:
    """Stable hash of the inputs that determine an ATS score.

    Used to skip returning a cached analysis after in-place resume/JD edits
    that keep the same version / job document ids.
    """
    payload = {
        "resume_plain": resume_plain_text or "",
        "resume_structured": structured_content if isinstance(structured_content, dict) else {},
        "resume_confirmed_at": resume_confirmed_at or "",
        "job_raw": job_raw_text or "",
        "job_confirmed_at": job_confirmed_at or "",
        "algorithm": ALGORITHM_VERSION,
    }
    raw = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalize(text: str) -> str:
    value = (text or "").casefold().replace("&", " and ")
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"[\u2018\u2019]", "'", value)
    value = re.sub(r"[^a-z0-9+#./\s-]", " ", value)
    return re.sub(r"\s+", " ", value).strip()
def _tokens(text: str) -> list[str]:
    return [match.group(0).casefold().strip(".-/") for match in TOKEN_PATTERN.finditer(text)]
def _canonical(value: str) -> str:
    normalized = _normalize(value)
    return ALIAS_TO_CANONICAL.get(normalized, normalized)
def _section_from_heading(line: str) -> str | None:
    header = _normalize(line).strip("-:| ")
    if not header or len(header) > 60:
        return None
    if len(header.split()) > 8:
        return None
    slug = re.sub(r"[^a-z0-9]+", "_", header).strip("_")
    return slug[:40] or None
def _plain_resume_lines(resume_text: str) -> list[tuple[str, str]]:
    """Parse plain resume text into (line, section_slug) pairs."""
    section = "body"
    result: list[tuple[str, str]] = []
    pending_blank = True
    for raw in (resume_text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            pending_blank = True
            continue
        inline = re.match(r"^([^:]{2,40}):\s*(.+)$", line)
        if inline:
            heading = _section_from_heading(inline.group(1))
            if heading and len(inline.group(1).split()) <= 6:
                section = heading
                body = inline.group(2).strip()
                if body:
                    result.append((body, section))
                pending_blank = False
                continue
        if pending_blank:
            heading = _section_from_heading(line)
            if heading and not line.endswith(".") and len(line.split()) <= 6:
                words = re.findall(r"[A-Za-z]+", line)
                titled = sum(1 for w in words if w[:1].isupper())
                if line.isupper() or line.endswith(":") or (words and titled / len(words) >= 0.8):
                    section = heading
                    pending_blank = False
                    continue
        result.append((line, section))
        pending_blank = False
    return result


def _structured_resume_lines(
    structured_sections: dict[str, list[str]] | None,
) -> list[tuple[str, str]]:
    if not structured_sections:
        return []
    result: list[tuple[str, str]] = []
    for section, items in structured_sections.items():
        for item in items or []:
            for raw in str(item or "").splitlines():
                line = re.sub(r"\s+", " ", raw).strip()
                if line:
                    result.append((line, str(section)))
    return result


def _resume_lines(
    resume_text: str,
    structured_sections: dict[str, list[str]] | None = None,
) -> list[tuple[str, str]]:
    """Build the evidence corpus from structured sections and plain text.

    Structured lines keep section labels when present. Plain-text lines that
    structured extraction missed are unioned in so incomplete structure cannot
    hide confirmed source text from scoring.
    """
    structured = _structured_resume_lines(structured_sections)
    plain = _plain_resume_lines(resume_text)
    if not structured:
        return plain
    if not plain:
        return structured
    seen = {_normalize(line) for line, _ in structured if _normalize(line)}
    merged = list(structured)
    for line, section in plain:
        key = _normalize(line)
        if key and key not in seen:
            merged.append((line, section))
            seen.add(key)
    return merged


def _classify_requirement(line: str, previous_type: str) -> str:
    """Classify a JD line as required/preferred using section-label patterns only."""
    if PREFERRED_SECTION_RE.search(line or ""):
        return "preferred"
    if REQUIRED_SECTION_RE.search(line or ""):
        return "required"
    # Mid-line preferred labels (e.g. "… Preferred: Docker")
    if re.search(r"(?i)\b(?:preferred|nice\s*to\s*have|nice-to-have|desired)\s*:", line or ""):
        return "preferred"
    if re.search(r"(?i)\b(?:required|must\s*have|must-have)\s*:", line or ""):
        return "required"
    return previous_type
def _candidate_terms_legacy(text: str, limit: int = 80) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    current_type = "required"
    known = set(ALIAS_GROUPS)
    for raw in (text or "").splitlines() or [text]:
        line = raw.strip()
        if not line:
            continue
        preferred_start = re.search(
            r"(?i)\b(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:", line
        )
        classification_text = line[: preferred_start.start()] if preferred_start else line
        current_type = _classify_requirement(classification_text, current_type)
        segments = re.split(
            r"(?i)(?=\b(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:)",
            line,
        )
        for segment in segments:
            segment_type = (
                "preferred"
                if re.match(r"(?i)\s*(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:", segment)
                else current_type
            )
            segment = re.sub(r"^[^:]{0,50}:\s*", "", segment)
            chunks = re.split(r"[,;|•]|\s+and\s+", segment, flags=re.IGNORECASE)
            for chunk in chunks:
                tokens = [token for token in _tokens(chunk) if token not in STOP_WORDS]
                if not tokens:
                    continue
                for size in (3, 2, 1):
                    if size > len(tokens):
                        continue
                    for index in range(len(tokens) - size + 1):
                        phrase = " ".join(tokens[index : index + size])
                        if size == 1 and len(phrase) < 3 and phrase not in SHORT_TECH_TERMS:
                            continue
                        if size == 1 and phrase in STOP_WORDS:
                            continue
                        canonical = _canonical(phrase)
                        key = (canonical, segment_type)
                        if key in seen:
                            continue
                        if size == 1 and any(
                            canonical in multi.split() and multi_kind == segment_type
                            for multi, multi_kind in seen
                            if " " in multi
                        ):
                            continue
                        if size >= 2 or canonical in known or len(phrase) >= 3:
                            seen.add(key)
                            candidates.append((canonical, segment_type))
    indexed = list(enumerate(candidates))
    indexed.sort(key=lambda pair: (0 if pair[1][0] in known else 1, pair[0]))
    return [item for _, item in indexed[:limit]]
def _term_boundary_pattern(alias: str) -> str:
    """Word-boundary pattern for aliases.

    Short tech tokens (go, r, ai, …) also treat hyphen as a boundary so
    ``go`` does not match inside ``go-to-market``.
    """
    escaped = re.escape(alias)
    if alias in SHORT_TECH_TERMS or len(alias) <= 2:
        return rf"(?<![a-z0-9+#.-]){escaped}(?![a-z0-9+#.-])"
    return rf"(?<![a-z0-9+#]){escaped}(?![a-z0-9+#])"


def _candidate_terms(text: str, limit: int = 80) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    current_type = "required"
    # When True, following plain (non-bullet) lines still yield known tech terms
    # until a non-skill section header ends the block.
    in_req_block = False
    known = set(ALIAS_GROUPS) | KNOWN_TECH_TERMS

    def add(value: str, kind: str) -> None:
        normalized = _normalize(value).strip(" .,:;|-")
        if not normalized:
            return
        canonical = _canonical(normalized)
        if canonical in STOP_WORDS or len(canonical) < 2:
            return
        key = (canonical, kind)
        if key in seen or len(candidates) >= limit:
            return
        seen.add(key)
        candidates.append((canonical, kind))

    def add_known_terms(line: str, kind: str) -> None:
        normalized_line = _normalize(line)
        for term in sorted(known, key=len, reverse=True):
            normalized_term = _normalize(term)
            if re.search(_term_boundary_pattern(normalized_term), normalized_line):
                add(term, kind)

    for raw in (text or "").splitlines() or [text]:
        line = raw.strip()
        if not line:
            continue
        if JD_SECTION_EXIT_RE.match(line):
            in_req_block = False
            continue
        segments = re.split(
            r"(?i)(?=\b(?:preferred|nice to have|nice-to-have|desired)\s*:)",
            line,
        )
        for segment in segments:
            if not segment.strip():
                continue
            preferred_segment = bool(
                re.match(
                    r"(?i)\s*(?:preferred|nice to have|nice-to-have|desired)\s*:",
                    segment,
                )
            )
            classified = _classify_requirement(segment, current_type)
            segment_type = "preferred" if preferred_segment else classified
            # Only sticky-update type from real section labels, not prose.
            if preferred_segment or PREFERRED_SECTION_RE.search(segment) or REQUIRED_SECTION_RE.search(segment):
                current_type = segment_type
            relevant_line = bool(
                re.search(
                    r"(?i)\b(?:" + "|".join(map(re.escape, RELEVANT_LINE_MARKERS)) + r")\b",
                    segment,
                )
            )
            bullet_line = bool(re.match(r"^[\u2022\u2023\u25E6*\-]\s+", segment))
            heading_only = bool(
                re.match(
                    r"(?i)^(?:required|preferred|qualifications|requirements|skills|"
                    r"must\s*have|nice\s*to\s*have)[^:]{0,40}:\s*$",
                    segment,
                )
            )
            if relevant_line or heading_only:
                in_req_block = True
            if not (relevant_line or bullet_line or in_req_block):
                continue
            add_known_terms(segment, segment_type)
            payload = re.sub(r"^[^:]{0,60}:\s*", "", segment).strip()
            # Do not split on '.' so Node.js / Next.js stay intact.
            chunks = re.split(r"[,;|/\u2022]|\s+and\s+", payload, flags=re.IGNORECASE)
            for chunk in chunks:
                cleaned = re.sub(r"^[\-*\s]+|[.!?]+$", "", chunk).strip()
                words = _tokens(cleaned)
                if not words or len(words) > 5:
                    continue
                if any(word in STOP_WORDS for word in words if word not in SHORT_TECH_TERMS):
                    continue
                normalized = _normalize(cleaned)
                if normalized in known or any(
                    re.search(_term_boundary_pattern(_normalize(term)), normalized) for term in known
                ):
                    add(cleaned, segment_type)
                    continue
                original_words = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]*", cleaned)
                technical_shape = any(
                    any(char in word for char in "+#./-") or word[:1].isupper()
                    for word in original_words
                )
                if technical_shape and len(words) <= 3:
                    add(cleaned, segment_type)
    return candidates[:limit]


def _aliases(term: str) -> tuple[str, ...]:
    canonical = _canonical(term)
    return ALIAS_GROUPS.get(canonical, (canonical,))


_STRENGTH_RANK = {"strong": 2, "partial": 1, "missing": 0}


def _find_match(
    term: str, lines: list[tuple[str, str]]
) -> tuple[str | None, str | None, str, str | None]:
    """Return the best (strongest) match across all resume lines.

    First-hit-wins systematically under-scored skills that appeared earlier in
    experience and again in a skills section.
    """
    normalized_aliases = tuple(_normalize(alias) for alias in _aliases(term) if _normalize(alias))
    if not normalized_aliases:
        return None, None, "missing", None
    best: tuple[str | None, str | None, str, str | None] = (None, None, "missing", None)
    for line, section in lines:
        normalized_line = _normalize(line)
        if not normalized_line:
            continue
        matched_alias = next(
            (
                alias
                for alias in normalized_aliases
                if re.search(_term_boundary_pattern(alias), normalized_line)
            ),
            None,
        )
        if not matched_alias:
            continue
        section_l = (section or "").casefold()
        exact_primary = matched_alias == _normalize(term) or matched_alias == term
        in_skills = any(
            token in section_l for token in ("skill", "technolog", "tool", "stack", "competenc")
        )
        # Alias-only hits (js→javascript) in skills still count as strong when the
        # alias group maps to the requirement; multi-word exact phrases also strong.
        strength = "partial"
        if in_skills and (exact_primary or matched_alias in {_normalize(a) for a in _aliases(term)}):
            strength = "strong"
        elif exact_primary and " " in matched_alias:
            strength = "strong"
        elif exact_primary and in_skills:
            strength = "strong"
        if _STRENGTH_RANK[strength] > _STRENGTH_RANK[best[2]]:
            best = (line, section, strength, matched_alias)
            if strength == "strong":
                break
    return best
def _suggested_section(term: str) -> str:
    normalized = _normalize(term)
    if any(word in normalized for word in ("degree", "education", "bachelor", "master")):
        return "education"
    if any(word in normalized for word in ("certification", "certificate")):
        return "certifications"
    return "skills"
def _explanation(term: str, line: str | None, section: str | None, strength: str, alias: str | None) -> str:
    if strength == "missing":
        return "Not found as an exact phrase in the confirmed resume source text."
    alias_note = f" (matched via '{alias}')" if alias and _normalize(alias) != _normalize(term) else ""
    where = f" in section '{section}'" if section else ""
    return f"Found in resume source{where}{alias_note}. Evidence quotes the resume line exactly."
def score_resume(
    resume_text: str,
    job_description: str,
    *,
    structured_sections: dict[str, list[str]] | None = None,
) -> AtsScore:
    requirements = _candidate_terms(job_description)
    if not requirements:
        raise ValueError("The job description does not contain enough scorable terms.")
    lines = _resume_lines(resume_text, structured_sections)
    if not lines:
        raise ValueError("The resume does not contain enough text to score.")
    weighted_total = sum(2.0 if kind == "required" else 1.0 for _, kind in requirements)
    earned_required = 0.0
    earned_preferred = 0.0
    matched: list[str] = []
    partial: list[str] = []
    missing: list[str] = []
    evidence: list[AtsEvidenceItem] = []
    section_summary: dict[str, list[str]] = {}
    for term, requirement_type in requirements:
        line, section, strength, alias = _find_match(term, lines)
        weight = 2.0 if requirement_type == "required" else 1.0
        credit = 1.0 if strength == "strong" else 0.5 if strength == "partial" else 0.0
        contribution = round(weight * credit / weighted_total * 100, 4)
        if requirement_type == "required":
            earned_required += weight * credit
        else:
            earned_preferred += weight * credit
        if strength == "strong":
            matched.append(term)
        elif strength == "partial":
            partial.append(term)
        else:
            missing.append(term)
        if section and strength != "missing":
            section_summary.setdefault(section, [])
            if term not in section_summary[section]:
                section_summary[section].append(term)
        evidence.append(
            AtsEvidenceItem(
                requirement=term,
                matched=strength != "missing",
                resume_evidence=line if strength != "missing" else None,
                resume_section=section if strength != "missing" else None,
                score_contribution=contribution if strength != "missing" else 0.0,
                explanation=_explanation(term, line, section, strength, alias),
                requirement_type=requirement_type,
                priority="critical" if requirement_type == "required" else "preferred",
                match_strength=strength,
                suggested_section=_suggested_section(term),
                matched_alias=alias if strength != "missing" else None,
            )
        )
    score = round(sum(item.score_contribution for item in evidence), 2)
    required_total = sum(2.0 for _, kind in requirements if kind == "required")
    preferred_total = sum(1.0 for _, kind in requirements if kind == "preferred")
    return AtsScore(
        overall_score=score,
        matched_terms=matched,
        missing_terms=missing,
        evidence=evidence,
        partial_terms=partial,
        required_score=round(earned_required / required_total * 100, 2) if required_total else 0.0,
        preferred_score=round(earned_preferred / preferred_total * 100, 2) if preferred_total else 0.0,
        section_summary=section_summary,
    )
