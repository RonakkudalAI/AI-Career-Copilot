
from __future__ import annotations

from typing import Any

MAX_ACTIVITY_EVENTS = 5
def activity_ids_to_delete(
    rows_newest_first: list[dict[str, Any]],
    keep: int = MAX_ACTIVITY_EVENTS,
) -> list[str]:
    if keep < 0:
        keep = 0
    if len(rows_newest_first) <= keep:
        return []
    return [str(row["id"]) for row in rows_newest_first[keep:] if row.get("id")]
