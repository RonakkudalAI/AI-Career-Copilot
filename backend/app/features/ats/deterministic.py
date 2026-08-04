"""Simple, evidence-only ATS keyword coverage.

Rules (intentional simplicity):
  - Score is only from JD requirements found in the resume source text.
  - Every match must quote an exact resume line (source of truth).
  - No LLM scoring path here — nothing is invented or paraphrased.
  - Aliases only expand how a JD term is searched; evidence is still resume text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

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
    "etc", "such", "well", "good", "plus",
}
PREFERRED_MARKERS = ("preferred", "nice to have", "nice-to-have", "bonus", "plus", "desired")
REQUIRED_MARKERS = ("required", "must have", "must-have", "minimum", "qualifications")

# Search aliases only — never shown as invented resume content.
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
            "truthfulness": (
                "Score and evidence use only confirmed resume/JD text. "
                "resume_evidence is always an exact quote from the resume source."
            ),
        }


def evidence_match_status(match_strength: str) -> str:
    return EVIDENCE_MATCH_STATUS.get(match_strength, "unverified")


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
    """Map a heading-like line to a simple section key using the heading words themselves."""
    header = _normalize(line).strip("-:| ")
    if not header or len(header) > 60:
        return None
    # Use heading tokens as the section name (slug) — no closed heading catalog.
    if len(header.split()) > 8:
        return None
    slug = re.sub(r"[^a-z0-9]+", "_", header).strip("_")
    return slug[:40] or None


def _resume_lines(
    resume_text: str,
    structured_sections: dict[str, list[str]] | None = None,
) -> list[tuple[str, str]]:
    """
    Build (exact_line, section) pairs from resume source.

    Prefer confirmed structured sections when present; otherwise split plain text
    by layout headings. Section labels never invent resume body text.
    """
    if structured_sections:
        result: list[tuple[str, str]] = []
        for section, items in structured_sections.items():
            for item in items or []:
                for raw in str(item or "").splitlines():
                    line = re.sub(r"\s+", " ", raw).strip()
                    if line:
                        result.append((line, str(section)))
        if result:
            return result

    section = "body"
    result = []
    pending_blank = True
    for raw in (resume_text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            pending_blank = True
            continue
        # Inline "Skills: Python, React"
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
        if pending_blank or not result:
            heading = _section_from_heading(line)
            # Treat short title-like lines after blanks as section switches.
            if heading and not line.endswith(".") and len(line.split()) <= 6:
                letters = [ch for ch in line if ch.isalpha()]
                titled = sum(1 for w in re.findall(r"[A-Za-z]+", line) if w[:1].isupper())
                words = re.findall(r"[A-Za-z]+", line)
                if line.isupper() or line.endswith(":") or (words and titled / len(words) >= 0.8):
                    section = heading
                    pending_blank = False
                    continue
        result.append((line, section))
        pending_blank = False
    return result


def _classify_requirement(line: str, previous_type: str) -> str:
    normalized = _normalize(line)
    if any(marker in normalized for marker in PREFERRED_MARKERS):
        return "preferred"
    if any(marker in normalized for marker in REQUIRED_MARKERS):
        return "required"
    return previous_type


def _candidate_terms(text: str, limit: int = 80) -> list[tuple[str, str]]:
    """Extract JD requirement phrases from the job description text only."""
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
                # Prefer multi-word technical phrases (max 3 tokens).
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
                        # Drop unigrams that are already covered by a multiword candidate.
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

    # Prefer known tech phrases, then first appearance; cap noise from long JDs.
    indexed = list(enumerate(candidates))
    indexed.sort(key=lambda pair: (0 if pair[1][0] in known else 1, pair[0]))
    return [item for _, item in indexed[:limit]]


def _aliases(term: str) -> tuple[str, ...]:
    canonical = _canonical(term)
    return ALIAS_GROUPS.get(canonical, (canonical,))


def _find_match(
    term: str, lines: list[tuple[str, str]]
) -> tuple[str | None, str | None, str, str | None]:
    """
    Return (exact_resume_line, section, strength, matched_alias).

    The returned line is always the original resume string — never rewritten.
    """
    normalized_aliases = tuple(_normalize(alias) for alias in _aliases(term) if _normalize(alias))
    if not normalized_aliases:
        return None, None, "missing", None

    for line, section in lines:
        normalized_line = _normalize(line)
        if not normalized_line:
            continue
        matched_alias = next(
            (
                alias
                for alias in normalized_aliases
                if re.search(rf"(?<![a-z0-9+#]){re.escape(alias)}(?![a-z0-9+#])", normalized_line)
            ),
            None,
        )
        if not matched_alias:
            continue
        # Strong = exact requirement phrase (or primary alias) in skills-like section
        # or exact multi-word match; otherwise partial (still evidence-backed).
        section_l = (section or "").casefold()
        exact_primary = matched_alias == _normalize(term) or matched_alias == term
        in_skills = any(token in section_l for token in ("skill", "technolog", "tool", "stack", "competenc"))
        strength = "strong" if (exact_primary and in_skills) or (" " in matched_alias and exact_primary) else "partial"
        if in_skills and exact_primary:
            strength = "strong"
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
    """Return auditable phrase coverage. Not a hiring prediction."""
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
                # Only quote real resume text when matched — never fabricate evidence.
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
