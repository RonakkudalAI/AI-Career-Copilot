"""
Profile-fill agent: resume text → reviewable profile draft.

Modules:
  deterministic.py  Rule-based section mapping
  normalize.py      Field cleaning (labels, skills, years, phones)
  pipeline.py       AI + rules orchestration (preview only; apply is in routes)
"""

from app.agents.profile_fill.deterministic import build_profile_draft, draft_counts
from app.agents.profile_fill.normalize import normalize_draft
from app.agents.profile_fill.pipeline import (
    build_profile_draft_enriched,
    merge_profile_drafts,
    profile_draft_response_payload,
)

__all__ = [
    "build_profile_draft",
    "build_profile_draft_enriched",
    "draft_counts",
    "merge_profile_drafts",
    "normalize_draft",
    "profile_draft_response_payload",
]
