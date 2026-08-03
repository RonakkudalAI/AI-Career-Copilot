from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.features.auth.service import CurrentUser
from app.core.errors import ApiError
from app.database.repository import owned_row


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def confirmed_version(client, version_id: UUID | str, user: CurrentUser) -> dict[str, Any]:
    version = owned_row(client, "resume_versions", version_id, user)
    if version.get("extraction_status") != "confirmed":
        raise ApiError(
            409,
            "resume_not_confirmed",
            "Confirm the selected resume extraction before requesting improvements.",
        )
    return version


def confirmed_jd(client, jd_id: UUID | str, user: CurrentUser) -> dict[str, Any]:
    job = owned_row(client, "job_descriptions", jd_id, user)
    if job.get("extraction_status") != "confirmed":
        raise ApiError(
            409,
            "job_description_not_confirmed",
            "Confirm the selected job description before using it as context.",
        )
    return job


def completed_analysis(
    client, analysis_id: UUID | str, user: CurrentUser
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    analysis = owned_row(client, "ats_analyses", analysis_id, user)
    if analysis.get("status") != "completed":
        raise ApiError(
            409, "ats_analysis_not_completed", "Only completed ATS evidence can be used as optional context."
        )
    evidence = (
        client.table("ats_evidence")
        .select("*")
        .eq("analysis_id", str(analysis_id))
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    return analysis, evidence


def create_run(client, user: CurrentUser, record: dict[str, Any]) -> dict[str, Any]:
    return (
        client.table("resume_improvement_runs").insert({**record, "user_id": str(user.id)}).execute().data[0]
    )


def update_run(client, run_id: str, user: CurrentUser, values: dict[str, Any]) -> dict[str, Any]:
    rows = (
        client.table("resume_improvement_runs")
        .update(values)
        .eq("id", run_id)
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    if not rows:
        raise ApiError(404, "improvement_run_not_found", "The improvement run was not found.")
    return rows[0]


def get_run(client, run_id: UUID | str, user: CurrentUser) -> dict[str, Any]:
    return owned_row(client, "resume_improvement_runs", run_id, user)


def list_run_suggestions(client, run_id: UUID | str, user: CurrentUser) -> list[dict[str, Any]]:
    get_run(client, run_id, user)
    return (
        client.table("resume_suggestions")
        .select("*")
        .eq("run_id", str(run_id))
        .eq("user_id", str(user.id))
        .order("created_at")
        .execute()
        .data
        or []
    )


def insert_suggestions(client, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    return client.table("resume_suggestions").insert(rows).execute().data or []


def get_suggestion(client, suggestion_id: UUID | str, user: CurrentUser) -> dict[str, Any]:
    return owned_row(client, "resume_suggestions", suggestion_id, user)
