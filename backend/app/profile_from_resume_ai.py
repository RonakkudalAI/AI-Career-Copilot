"""Compatibility shim — prefer `from app.features.profile.agent import ...`."""

from app.features.profile.agent.pipeline import (
    build_profile_draft_enriched,
    merge_profile_drafts,
    profile_draft_response_payload,
    _filter_draft_by_evidence,
)

__all__ = [
    "build_profile_draft_enriched",
    "merge_profile_drafts",
    "profile_draft_response_payload",
    "_filter_draft_by_evidence",
]
