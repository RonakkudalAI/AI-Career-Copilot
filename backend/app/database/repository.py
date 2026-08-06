import logging
from typing import Any
from uuid import UUID

from app.core.config import Settings
from app.core.errors import ApiError
from app.database.activity import MAX_ACTIVITY_EVENTS, activity_ids_to_delete
from app.database.client import database_client
from app.features.auth.service import CurrentUser
from app.features.profile.completion import calculate_profile_completion

logger = logging.getLogger(__name__)
CANDIDATE_TABLES = {
    "skills": "candidate_skills",
    "experiences": "candidate_experiences",
    "projects": "candidate_projects",
    "education": "candidate_education",
    "certifications": "candidate_certifications",
    "languages": "candidate_languages",
    "links": "candidate_links",
}

# Firestore omits documents that lack the order_by field. Prefer client-side
# recency sort with fallbacks so legacy rows without created_at still appear.
_TIME_FALLBACKS = (
    "created_at",
    "completed_at",
    "started_at",
    "saved_at",
    "updated_at",
    "candidate_confirmed_at",
)


def client_for(settings: Settings, user: CurrentUser):
    return database_client(settings)


def row_recency_key(row: dict[str, Any], preferred: str | None = None) -> str:
    """Stable sort key for newest-first lists when created_at may be missing.

    Timestamp strings sort lexicographically when ISO-8601. Missing times use a
    low sentinel so rows *with* timestamps always win under reverse=True.
    """
    keys = (preferred,) + _TIME_FALLBACKS if preferred else _TIME_FALLBACKS
    for key in keys:
        if not key:
            continue
        value = row.get(key)
        if value not in (None, ""):
            return f"1:{value}"
    # Last resort: document id (always sorts below real timestamps).
    return f"0:{row.get('id') or ''}"


def sort_rows_by_recency(
    rows: list[dict[str, Any]],
    *,
    desc: bool = True,
    preferred: str | None = "created_at",
) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: row_recency_key(row, preferred), reverse=desc)


def owned_rows(
    client,
    table: str,
    user: CurrentUser,
    order: str | None = None,
    *,
    desc: bool = False,
) -> list[dict[str, Any]]:
    """List user-owned rows.

    Ordering is applied in-process. Server-side ``order_by(created_at)`` is unsafe
    on Firestore when some legacy documents omit ``created_at`` (they vanish).
    """
    rows = (
        client.table(table)
        .select("*")
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    if order:
        return sort_rows_by_recency(rows, desc=desc, preferred=order)
    return rows


def owned_row(client, table: str, record_id: UUID | str, user: CurrentUser) -> dict[str, Any]:
    rows = (
        client.table(table)
        .select("*")
        .eq("id", str(record_id))
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ApiError(404, "record_not_found", "The requested record was not found.")
    return rows[0]


def prune_activity_events(
    client,
    user: CurrentUser,
    *,
    keep: int = MAX_ACTIVITY_EVENTS,
) -> int:
    try:
        rows = (
            client.table("activity_events")
            .select("id,created_at,started_at")
            .eq("user_id", str(user.id))
            .execute()
            .data
            or []
        )
        rows = sort_rows_by_recency(rows, desc=True)
        stale_ids = activity_ids_to_delete(rows, keep=keep)
        if not stale_ids:
            return 0
        client.table("activity_events").delete().in_("id", stale_ids).eq("user_id", str(user.id)).execute()
        return len(stale_ids)
    except Exception:
        logger.warning("activity_prune_failed user_id=%s", user.id)
        return 0


def list_recent_activity(
    client,
    user: CurrentUser,
    *,
    limit: int = MAX_ACTIVITY_EVENTS,
) -> list[dict[str, Any]]:
    fetch_limit = min(max(limit, 0), MAX_ACTIVITY_EVENTS)
    if fetch_limit == 0:
        return []
    rows = (
        client.table("activity_events")
        .select("id,event_type,summary,entity_type,entity_id,created_at")
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    return sort_rows_by_recency(rows, desc=True)[:fetch_limit]


def write_activity(
    client,
    user: CurrentUser,
    event_type: str,
    summary: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    from datetime import UTC, datetime

    try:
        client.table("activity_events").insert(
            {
                "user_id": str(user.id),
                "event_type": event_type,
                "summary": summary,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ).execute()
        prune_activity_events(client, user, keep=MAX_ACTIVITY_EVENTS)
    except Exception:
        logger.warning("activity_write_failed operation=%s user_id=%s", event_type, user.id)
def sync_profile_from_auth_metadata(client, user: CurrentUser) -> dict[str, Any]:
    profile_rows = client.table("profiles").select("*").eq("id", str(user.id)).single().execute().data or []
    profile = profile_rows[0] if profile_rows else {}
    auth_name = (user.full_name or "").strip()
    existing = str(profile.get("full_name") or "").strip()
    if auth_name and not existing:
        updated = (
            client.table("profiles")
            .update({"full_name": auth_name[:120]})
            .eq("id", str(user.id))
            .execute()
            .data
        )
        if updated:
            return updated[0]
        profile = {**profile, "full_name": auth_name[:120]}
    return profile
def recalculate_completion(client, user: CurrentUser) -> dict[str, Any]:
    profile = sync_profile_from_auth_metadata(client, user)
    pref_rows = (
        client.table("candidate_preferences")
        .select("*")
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    preferences = pref_rows[0] if pref_rows else {}
    years = profile.get("years_experience")
    try:
        years_num = float(years) if years is not None and years != "" else None
    except (TypeError, ValueError):
        years_num = None
    no_experience_declared = years_num is not None and years_num == 0.0
    experience_rows = owned_rows(client, "candidate_experiences", user)
    skill_rows = owned_rows(client, "candidate_skills", user)
    education_rows = owned_rows(client, "candidate_education", user)
    link_rows = owned_rows(client, "candidate_links", user)
    context = {
        "profile": profile,
        "preferences": preferences,
        "has_experience": bool(experience_rows),
        "no_experience_declared": no_experience_declared,
        "skill_count": len(skill_rows),
        "education_count": len(education_rows),
        "link_count": len(link_rows),
    }
    percentage, details = calculate_profile_completion(context)
    updated = (
        client.table("profiles")
        .update({"profile_completion": percentage, "profile_completion_details": details})
        .eq("id", str(user.id))
        .execute()
        .data
    )
    if not updated:
        return {
            **profile,
            "profile_completion": percentage,
            "profile_completion_details": details,
        }
    return updated[0]
