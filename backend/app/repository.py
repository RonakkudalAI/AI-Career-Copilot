import logging
from typing import Any
from uuid import UUID

from app.activity import MAX_ACTIVITY_EVENTS, activity_ids_to_delete
from app.auth import CurrentUser
from app.config import Settings
from app.errors import ApiError
from app.profile_completion import calculate_profile_completion
from app.supabase_clients import create_user_supabase_client

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


def client_for(settings: Settings, user: CurrentUser):
    return create_user_supabase_client(settings, user)


def owned_rows(client, table: str, user: CurrentUser, order: str | None = None) -> list[dict[str, Any]]:
    query = client.table(table).select("*").eq("user_id", str(user.id))
    if order:
        query = query.order(order)
    return query.execute().data or []


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
    """
    Delete activity rows older than the newest `keep` for this user.
    Returns how many rows were requested for deletion.
    """
    try:
        rows = (
            client.table("activity_events")
            .select("id,created_at")
            .eq("user_id", str(user.id))
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        stale_ids = activity_ids_to_delete(rows, keep=keep)
        if not stale_ids:
            return 0
        # Batch delete; RLS scopes to the authenticated user via user_id filter.
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
    """Return at most `limit` newest activities and prune anything beyond retention."""
    prune_activity_events(client, user, keep=MAX_ACTIVITY_EVENTS)
    fetch_limit = min(max(limit, 0), MAX_ACTIVITY_EVENTS)
    if fetch_limit == 0:
        return []
    return (
        client.table("activity_events")
        .select("id,event_type,summary,entity_type,entity_id,created_at")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(fetch_limit)
        .execute()
        .data
        or []
    )


def write_activity(
    client,
    user: CurrentUser,
    event_type: str,
    summary: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    try:
        client.table("activity_events").insert(
            {
                "user_id": str(user.id),
                "event_type": event_type,
                "summary": summary,
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
        ).execute()
        # Always retain only the newest MAX_ACTIVITY_EVENTS rows in Supabase.
        prune_activity_events(client, user, keep=MAX_ACTIVITY_EVENTS)
    except Exception:
        logger.warning("activity_write_failed operation=%s user_id=%s", event_type, user.id)


def sync_profile_from_auth_metadata(client, user: CurrentUser) -> dict[str, Any]:
    """
    Ensure profiles.full_name is populated from Auth user_metadata when empty.
    Sign-up stores full_name in raw_user_meta_data; the DB trigger should copy it,
    but onboarding must still work if the profile row is blank.
    """
    profile = client.table("profiles").select("*").eq("id", str(user.id)).single().execute().data or {}
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
    # Keep full_name in sync with sign-up metadata before scoring completion.
    profile = sync_profile_from_auth_metadata(client, user)
    preferences = (
        client.table("candidate_preferences").select("*").eq("user_id", str(user.id)).single().execute().data
        or {}
    )
    years = profile.get("years_experience")
    try:
        no_experience_declared = years is not None and float(years) == 0
    except (TypeError, ValueError):
        no_experience_declared = False
    context = {
        "profile": profile,
        "preferences": preferences,
        "has_experience": bool(owned_rows(client, "candidate_experiences", user)),
        "no_experience_declared": no_experience_declared,
        "skill_count": len(owned_rows(client, "candidate_skills", user)),
        "education_count": len(owned_rows(client, "candidate_education", user)),
        "link_count": len(owned_rows(client, "candidate_links", user)),
        "has_valid_resume": bool(
            client.table("resume_versions")
            .select("id")
            .eq("user_id", str(user.id))
            .eq("extraction_status", "confirmed")
            .limit(1)
            .execute()
            .data
        ),
    }
    percentage, details = calculate_profile_completion(context)
    return (
        client.table("profiles")
        .update({"profile_completion": percentage, "profile_completion_details": details})
        .eq("id", str(user.id))
        .execute()
        .data[0]
    )
