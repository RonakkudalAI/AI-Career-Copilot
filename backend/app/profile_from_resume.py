"""Compatibility shim — prefer `from app.agents.profile_fill import ...`."""

from app.agents.profile_fill.deterministic import build_profile_draft, draft_counts

__all__ = ["build_profile_draft", "draft_counts"]
