"""Deterministic, evidence-backed ATS keyword coverage scoring."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

ALGORITHM_VERSION = "deterministic-keyword-coverage-v1"
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.]*")
SHORT_TECH_TERMS = {"ai", "bi", "go", "ml", "r", "ui", "ux"}
STOP_WORDS = {
    "about",
    "also",
    "and",
    "are",
    "been",
    "being",
    "candidate",
    "company",
    "description",
    "excellent",
    "experience",
    "familiarity",
    "for",
    "from",
    "have",
    "ideal",
    "including",
    "job",
    "knowledge",
    "must",
    "need",
    "our",
    "preferred",
    "required",
    "requirements",
    "responsibilities",
    "role",
    "should",
    "skills",
    "strong",
    "team",
    "that",
    "the",
    "their",
    "this",
    "using",
    "with",
    "work",
    "years",
    "you",
    "your",
}


@dataclass(frozen=True)
class AtsEvidenceItem:
    requirement: str
    matched: bool
    resume_evidence: str | None
    resume_section: str | None
    score_contribution: float


@dataclass(frozen=True)
class AtsScore:
    overall_score: float
    matched_terms: list[str]
    missing_terms: list[str]
    evidence: list[AtsEvidenceItem]

    @property
    def breakdown(self) -> dict[str, object]:
        return {
            "method": "keyword_coverage",
            "matched_count": len(self.matched_terms),
            "missing_count": len(self.missing_terms),
            "total_terms": len(self.matched_terms) + len(self.missing_terms),
            "matched_terms": self.matched_terms,
            "missing_terms": self.missing_terms,
            "keyword_coverage_score": self.overall_score,
        }


def _tokens(text: str) -> list[str]:
    return [match.group(0).casefold().rstrip(".") for match in TOKEN_PATTERN.finditer(text)]


def _requirements(job_description: str, limit: int = 50) -> list[str]:
    tokens = [
        token
        for token in _tokens(job_description)
        if token not in STOP_WORDS and (len(token) >= 3 or token in SHORT_TECH_TERMS)
    ]
    counts = Counter(tokens)
    first_position = {token: index for index, token in enumerate(tokens)}
    return sorted(counts, key=lambda token: (-counts[token], first_position[token]))[:limit]


def _resume_lines(resume_text: str) -> list[str]:
    return [line.strip() for line in resume_text.splitlines() if line.strip()]


def score_resume(resume_text: str, job_description: str) -> AtsScore:
    """Return auditable keyword coverage; this is not a hiring prediction."""

    requirements = _requirements(job_description)
    if not requirements:
        raise ValueError("The job description does not contain enough scorable terms.")

    resume_tokens = set(_tokens(resume_text))
    lines = _resume_lines(resume_text)
    contribution = round(100 / len(requirements), 4)
    matched: list[str] = []
    missing: list[str] = []
    evidence: list[AtsEvidenceItem] = []
    for requirement in requirements:
        is_match = requirement in resume_tokens
        evidence_line = next((line for line in lines if requirement in set(_tokens(line))), None)
        if is_match:
            matched.append(requirement)
        else:
            missing.append(requirement)
        evidence.append(
            AtsEvidenceItem(
                requirement=requirement,
                matched=is_match,
                resume_evidence=evidence_line,
                resume_section=None,
                score_contribution=contribution if is_match else 0,
            )
        )

    score = round(len(matched) * 100 / len(requirements), 2)
    return AtsScore(score, matched, missing, evidence)
