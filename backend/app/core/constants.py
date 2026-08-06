
from __future__ import annotations

JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 8
DEFAULT_JWT_TTL_SECONDS = 60 * 60 * 24 * 7
DOMAIN_GATE_MIN_SKILL_OVERLAP = 0.15
ATS_COMPOSITE_WEIGHTS: dict[str, float] = {
    "hard_skill_match": 0.40,
    "experience_relevance": 0.25,
    "education_match": 0.15,
    "certifications_match": 0.10,
    "seniority_alignment": 0.10,
}
