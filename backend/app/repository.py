import logging
from typing import Any
from uuid import UUID

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
    except Exception:
        logger.warning("activity_write_failed operation=%s user_id=%s", event_type, user.id)


def recalculate_completion(client, user: CurrentUser) -> dict[str, Any]:
    profile = client.table("profiles").select("*").eq("id", str(user.id)).single().execute().data or {}
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
