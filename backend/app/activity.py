"""Candidate activity feed retention policy."""

from __future__ import annotations

from typing import Any

# Hard cap: only the newest N activity rows are retained per candidate.
MAX_ACTIVITY_EVENTS = 5


def activity_ids_to_delete(
    rows_newest_first: list[dict[str, Any]],
    keep: int = MAX_ACTIVITY_EVENTS,
) -> list[str]:
    """Return ids beyond the retention window. `rows_newest_first` must be newest → oldest."""
    if keep < 0:
        keep = 0
    if len(rows_newest_first) <= keep:
        return []
    return [str(row["id"]) for row in rows_newest_first[keep:] if row.get("id")]
