from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.core.errors import ApiError
from app.features.auth.service import CurrentUser

logger = logging.getLogger(__name__)
CONFIRM_PHRASE = "DELETE MY ACCOUNT"

# User-owned collections deleted before the users document (children first by convention).
USER_OWNED_TABLES: list[tuple[str, str]] = [
    ("activity_events", "user_id"),
    ("user_notifications", "user_id"),
    ("saved_jobs", "user_id"),
    ("job_recommendations", "user_id"),
    ("learning_resources", "user_id"),
    ("learning_items", "user_id"),
    ("learning_paths", "user_id"),
    ("interview_reports", "user_id"),
    ("interview_responses", "user_id"),
    ("interview_questions", "user_id"),
    ("interview_sessions", "user_id"),
    ("ats_evidence", "user_id"),
    ("ats_analyses", "user_id"),
    ("resume_improvement_runs", "user_id"),
    ("resume_suggestions", "user_id"),
    ("resume_exports", "user_id"),
    ("resume_versions", "user_id"),
    ("resumes", "user_id"),
    ("job_descriptions", "user_id"),
    ("candidate_links", "user_id"),
    ("candidate_languages", "user_id"),
    ("candidate_certifications", "user_id"),
    ("candidate_education", "user_id"),
    ("candidate_projects", "user_id"),
    ("candidate_experiences", "user_id"),
    ("candidate_skills", "user_id"),
    ("candidate_preferences", "user_id"),
    ("notification_preferences", "user_id"),
    ("privacy_preferences", "user_id"),
]

_DOCUMENT_PATH_QUERIES: list[tuple[str, str]] = [
    ("resume_versions", "storage_path"),
    ("resume_exports", "storage_path"),
    ("job_descriptions", "storage_path"),
]


def confirmation_is_valid(phrase: str | None) -> bool:
    return (phrase or "").strip() == CONFIRM_PHRASE


def email_matches_account(provided: str | None, account_email: str | None) -> bool:
    if provided is None or not str(provided).strip():
        return False
    if not account_email:
        return False
    return str(provided).strip().lower() == str(account_email).strip().lower()


def collect_user_storage_paths(client, user: CurrentUser) -> dict[str, list[str]]:
    uid = str(user.id)
    buckets: dict[str, list[str]] = {"candidate-documents": [], "candidate-avatars": []}

    def _add(bucket: str, path: Any) -> None:
        if not path:
            return
        cleaned = str(path).strip()
        if cleaned and cleaned not in buckets[bucket]:
            buckets[bucket].append(cleaned)

    for table, column in _DOCUMENT_PATH_QUERIES:
        try:
            rows = client.table(table).select(column).eq("user_id", uid).execute().data or []
            for row in rows:
                _add("candidate-documents", row.get(column))
        except Exception as exc:
            logger.exception("account_delete_path_collect_failed table=%s user_id=%s", table, uid)
            raise ApiError(500, "account_deletion_incomplete", "Could not enumerate stored account files.") from exc
    try:
        profile = client.table("profiles").select("avatar_path").eq("id", uid).limit(1).execute().data or []
        if profile:
            _add("candidate-avatars", profile[0].get("avatar_path"))
    except Exception as exc:
        logger.exception("account_delete_path_collect_failed table=profiles user_id=%s", uid)
        raise ApiError(500, "account_deletion_incomplete", "Could not enumerate the account avatar.") from exc
    return buckets


def delete_user_owned_records(client, user: CurrentUser) -> dict[str, int]:
    """Delete all known user-owned rows. Returns counts per table. Raises on hard failure."""
    uid = str(user.id)
    deleted: dict[str, int] = {}
    for table, column in USER_OWNED_TABLES:
        try:
            result = client.table(table).delete().eq(column, uid).execute()
            deleted[table] = len(result.data or [])
        except Exception as exc:
            logger.exception("account_delete_table_failed table=%s user_id=%s", table, uid)
            raise ApiError(
                500,
                "account_deletion_incomplete",
                f"Could not delete user data from {table}. Account deletion stopped.",
            ) from exc
    try:
        result = client.table("profiles").delete().eq("id", uid).execute()
        deleted["profiles"] = len(result.data or [])
    except Exception as exc:
        logger.exception("account_delete_profile_failed user_id=%s", uid)
        raise ApiError(
            500,
            "account_deletion_incomplete",
            "Could not delete the profile. Account deletion stopped.",
        ) from exc
    return deleted


def _list_prefix_recursive(admin_client, bucket: str, prefix: str) -> list[str]:
    found: list[str] = []
    stack = [prefix.strip("/")]
    seen_dirs: set[str] = set()
    while stack:
        current = stack.pop()
        if current in seen_dirs:
            continue
        seen_dirs.add(current)
        try:
            entries = admin_client.storage.from_(bucket).list(current) or []
        except Exception as exc:
            logger.exception("account_delete_storage_list_failed bucket=%s prefix=%s", bucket, current)
            raise RuntimeError(f"Could not enumerate Firebase Storage bucket {bucket}") from exc
        for entry in entries:
            name = (entry or {}).get("name")
            if not name:
                continue
            path = f"{current}/{name}" if current else name
            metadata = (entry or {}).get("metadata") or {}
            is_file = bool(metadata) or (entry or {}).get("id")
            if is_file:
                found.append(path)
            else:
                stack.append(path)
    return found


def purge_user_storage(
    admin_client, settings: Settings, user: CurrentUser, known_paths: dict[str, list[str]]
) -> dict[str, int]:
    uid = str(user.id)
    bucket_map = {
        "candidate-documents": settings.document_bucket,
        "candidate-avatars": settings.avatar_bucket,
    }
    removed: dict[str, int] = {key: 0 for key in bucket_map}
    for logical, bucket in bucket_map.items():
        paths = list(known_paths.get(logical) or [])
        try:
            paths.extend(_list_prefix_recursive(admin_client, bucket, uid))
        except Exception as exc:
            logger.exception("account_delete_storage_list_failed bucket=%s user_id=%s", bucket, uid)
            raise ApiError(500, "account_deletion_incomplete", "Could not enumerate stored account files.") from exc
        unique: list[str] = []
        seen: set[str] = set()
        for path in paths:
            if path and path not in seen:
                seen.add(path)
                unique.append(path)
        chunk_size = 50
        for index in range(0, len(unique), chunk_size):
            chunk = unique[index : index + chunk_size]
            try:
                admin_client.storage.from_(bucket).remove(chunk)
                removed[logical] += len(chunk)
            except Exception as exc:
                logger.exception(
                    "account_delete_storage_remove_failed bucket=%s count=%s user_id=%s",
                    bucket,
                    len(chunk),
                    uid,
                )
                raise ApiError(500, "account_deletion_incomplete", "Could not remove all stored account files.") from exc
    return removed
