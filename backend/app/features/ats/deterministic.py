"""
Backward-compatible re-export of ATS scoring.

All scoring logic lives in `app.features.ats.ats_score` (single file to read/explain).
This module keeps older imports working.
"""

from app.features.ats.ats_score import (  # noqa: F401
    ALGORITHM_VERSION,
    ALIAS_GROUPS,
    AtsEvidenceItem,
    AtsScore,
    EVIDENCE_MATCH_STATUS,
    evidence_match_status,
    score_resume,
)

__all__ = [
    "ALGORITHM_VERSION",
    "ALIAS_GROUPS",
    "AtsEvidenceItem",
    "AtsScore",
    "EVIDENCE_MATCH_STATUS",
    "evidence_match_status",
    "score_resume",
]
