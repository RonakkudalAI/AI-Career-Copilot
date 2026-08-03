"""Deterministic, evidence-backed ATS phrase coverage scoring.

This module deliberately uses transparent rules instead of embeddings. Every
score contribution can be traced to a JD requirement, a normalized alias, and
the resume line/section where the evidence was found.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

ALGORITHM_VERSION = "deterministic-phrase-coverage-v2"
EVIDENCE_MATCH_STATUS = {
    "strong": "strong_match",
    "partial": "partial_match",
    "missing": "not_found",
}
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9+#./-]*")
SHORT_TECH_TERMS = {"ai", "bi", "go", "ml", "r", "ui", "ux", "js"}
STOP_WORDS = {
    "about", "also", "and", "are", "been", "being", "candidate", "company",
    "description", "excellent", "experience", "familiarity", "for", "from",
    "have", "ideal", "including", "job", "knowledge", "must", "need", "our",
    "preferred", "required", "requirements", "responsibilities", "role", "should",
    "skills", "strong", "team", "that", "the", "their", "this", "using", "with",
    "work", "years", "you", "your", "will", "within", "ability", "looking", "join",
}
SECTION_NAMES = {
    "skills": "skills",
    "technical skills": "skills",
    "core skills": "skills",
    "professional experience": "experience",
    "work experience": "experience",
    "experience": "experience",
    "projects": "projects",
    "education": "education",
    "certifications": "certifications",
    "certificates": "certifications",
    "summary": "summary",
    "profile": "summary",
}
PREFERRED_MARKERS = ("preferred", "nice to have", "nice-to-have", "bonus", "plus", "desired")
REQUIRED_MARKERS = ("required", "must have", "must-have", "minimum", "qualifications")

# Canonical name -> accepted spellings. The canonical name is what appears in
# evidence and reports; aliases remain visible in the rule_id for auditability.
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
        }


def evidence_match_status(match_strength: str) -> str:
    """Translate internal match strength into the persisted API status contract."""
    return EVIDENCE_MATCH_STATUS.get(match_strength, "unverified")


def _normalize(text: str) -> str:
    value = (text or "").casefold().replace("&", " and ")
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"[\u2018\u2019]", "'", value)
    value = re.sub(r"[^a-z0-9+#./\s-]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _tokens(text: str) -> list[str]:
    return [match.group(0).casefold().strip(".-/") for match in TOKEN_PATTERN.finditer(text)]


def _canonical(value: str) -> str:
    normalized = _normalize(value)
    return ALIAS_TO_CANONICAL.get(normalized, normalized)


def _resume_lines(resume_text: str) -> list[tuple[str, str]]:
    section = "summary"
    result: list[tuple[str, str]] = []
    for raw in resume_text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        header = _normalize(line).strip("-:| ")
        if header in SECTION_NAMES:
            section = SECTION_NAMES[header]
            continue
        heading_match = re.match(r"^([^:]{2,40}):\s*(.+)$", line)
        if heading_match and _normalize(heading_match.group(1)) in SECTION_NAMES:
            section = SECTION_NAMES[_normalize(heading_match.group(1))]
            line = heading_match.group(2).strip()
        result.append((line, section))
    return result


def _classify_requirement(line: str, previous_type: str) -> str:
    normalized = _normalize(line)
    if any(marker in normalized for marker in PREFERRED_MARKERS):
        return "preferred"
    if any(marker in normalized for marker in REQUIRED_MARKERS):
        return "required"
    return previous_type


def _candidate_terms(text: str, limit: int = 120) -> list[tuple[str, str]]:
    """Extract useful unigrams and contiguous bigrams/trigrams from JD lines."""
    candidates: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    current_type = "required"
    known = set(ALIAS_GROUPS)
    for raw in text.splitlines() or [text]:
        line = raw.strip()
        if not line:
            continue
        preferred_start = re.search(r"(?i)\b(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:", line)
        classification_text = line[: preferred_start.start()] if preferred_start else line
        current_type = _classify_requirement(classification_text, current_type)
        segments = re.split(
            r"(?i)(?=\b(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:)",
            line,
        )
        for segment in segments:
            segment_type = "preferred" if re.match(r"(?i)\s*(?:preferred|nice to have|nice-to-have|bonus|desired)\s*:", segment) else current_type
            segment = re.sub(r"^[^:]{0,50}:\s*", "", segment)
            chunks = re.split(r"[,;|•]|\s+and\s+", segment, flags=re.IGNORECASE)
            for chunk in chunks:
                tokens = [token for token in _tokens(chunk) if token not in STOP_WORDS]
                if not tokens:
                    continue
                phrase_tokens = " ".join(tokens)
                if len(tokens) <= 4 and (len(tokens) > 1 or len(phrase_tokens) >= 3):
                    canonical = _canonical(phrase_tokens)
                    if canonical in known or len(tokens) <= 3:
                        key = (canonical, segment_type)
                        if key not in seen:
                            seen.add(key)
                            candidates.append((canonical, segment_type))
                for size in (2, 1):
                    for index in range(len(tokens) - size + 1):
                        phrase = " ".join(tokens[index : index + size])
                        if size == 1 and len(phrase) < 3 and phrase not in SHORT_TECH_TERMS:
                            continue
                        canonical = _canonical(phrase)
                        if size == 2 and canonical not in known and len(tokens) > 3:
                            continue
                        key = (canonical, segment_type)
                        if key not in seen:
                            seen.add(key)
                            candidates.append((canonical, segment_type))
    # Prefer explicit known phrases and then stable first appearance. Do not
    # allow a long JD to turn every grammatical fragment into a requirement.
    multiword = {(item[0], item[1]) for item in candidates if " " in item[0]}
    candidates = [
        item for item in candidates
        if not (
            " " not in item[0]
            and any(item[0] in phrase.split() for phrase, kind in multiword if kind == item[1])
        )
    ]
    known = {canonical for canonical in ALIAS_GROUPS}
    indexed = list(enumerate(candidates))
    indexed.sort(key=lambda pair: (0 if pair[1][0] in known else 1, pair[0]))
    return [item for _, item in indexed[:limit]]


def _aliases(term: str) -> tuple[str, ...]:
    canonical = _canonical(term)
    return ALIAS_GROUPS.get(canonical, (canonical,))


def _find_match(term: str, lines: list[tuple[str, str]]) -> tuple[str | None, str | None, str | None, str | None]:
    normalized_aliases = tuple(_normalize(alias) for alias in _aliases(term))
    for line, section in lines:
        normalized_line = _normalize(line)
        matched_alias = next((alias for alias in normalized_aliases if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized_line)), None)
        if matched_alias:
            strength = "strong" if section == "skills" else "partial"
            return line, section, strength, matched_alias
    return None, None, "missing", None


def _suggested_section(term: str) -> str:
    normalized = _normalize(term)
    if any(word in normalized for word in ("degree", "education", "bachelor", "master")):
        return "education"
    if any(word in normalized for word in ("certification", "certificate")):
        return "certifications"
    return "skills"


def _explanation(term: str, line: str | None, section: str | None, strength: str, alias: str | None) -> str:
    if strength == "missing":
        return "Not found in the confirmed resume text."
    alias_note = f" via alias '{alias}'" if alias and alias != term else ""
    return f"Matched{alias_note} in the {section or 'resume'} section; evidence strength is {strength}."


def score_resume(resume_text: str, job_description: str) -> AtsScore:
    """Return auditable phrase coverage; this is not a hiring prediction."""
    requirements = _candidate_terms(job_description)
    if not requirements:
        raise ValueError("The job description does not contain enough scorable terms.")

    lines = _resume_lines(resume_text)
    weighted_total = sum(2.0 if kind == "required" else 1.0 for _, kind in requirements)
    earned_required = 0.0
    earned_preferred = 0.0
    matched: list[str] = []
    partial: list[str] = []
    missing: list[str] = []
    evidence: list[AtsEvidenceItem] = []
    section_summary: dict[str, list[str]] = {key: [] for key in SECTION_NAMES.values()}

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
        if section and term not in section_summary.setdefault(section, []):
            section_summary[section].append(term)
        evidence.append(
            AtsEvidenceItem(
                requirement=term,
                matched=strength != "missing",
                resume_evidence=line,
                resume_section=section,
                score_contribution=contribution,
                explanation=_explanation(term, line, section, strength, alias),
                requirement_type=requirement_type,
                priority="critical" if requirement_type == "required" else "preferred",
                match_strength=strength,
                suggested_section=_suggested_section(term),
                matched_alias=alias,
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
