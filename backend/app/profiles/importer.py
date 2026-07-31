from typing import Any

from app.core.errors import ApiError


def insert_validated_batch(client: Any, table: str, rows: list[dict[str, Any]]) -> int:
    """Insert a validated batch through the local database adapter."""
    if not rows:
        return 0
    try:
        result = client.table(table).insert(rows).execute()
    except Exception as exc:
        resource = table.removeprefix("candidate_")
        raise ApiError(502, "profile_import_failed", f"Could not save imported {resource} records.") from exc
    return len(result.data or [])
