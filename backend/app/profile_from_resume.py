"""Compatibility shim — prefer `from app.features.profile.agent import ...`."""

from app.features.profile.agent.deterministic import build_profile_draft, draft_counts

__all__ = ["build_profile_draft", "draft_counts"]
