"""
Named application constants that are not environment-specific configuration.

Deploy-specific values (URLs, models, secrets, timeouts for LLM providers)
live in Settings / .env. Protocol algorithms, SQLite knobs, and fixed product
rules are centralized here so they are not duplicated as magic numbers.
"""

from __future__ import annotations

# Authentication
JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 6

# Local SQLite connection behaviour
SQLITE_CONNECT_TIMEOUT_SECONDS = 10
SQLITE_BUSY_TIMEOUT_MS = 10_000

# ATS domain gate: reject cross-domain pairs with low required-skill overlap
DOMAIN_GATE_MIN_SKILL_OVERLAP = 0.15

# Structured ATS composite weights (must sum to 1.0)
ATS_COMPOSITE_WEIGHTS: dict[str, float] = {
    "hard_skill_match": 0.40,
    "experience_relevance": 0.25,
    "education_match": 0.15,
    "certifications_match": 0.10,
    "seniority_alignment": 0.10,
}
