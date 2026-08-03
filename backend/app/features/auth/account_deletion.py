"""Account deletion helpers: collect owned storage paths and wipe auth + data."""

from __future__ import annotations

import logging
from typing import Any

from app.features.auth.service import CurrentUser
from app.core.config import Settings

logger = logging.getLogger(__name__)

CONFIRM_PHRASE = "DELETE MY ACCOUNT"

# Tables that store file paths for this candidate (all are user_id scoped).
_DOCUMENT_PATH_QUERIES: list[tuple[str, str]] = [
    ("resume_versions", "storage_path"),
    ("resume_exports", "storage_path"),
    ("job_descriptions", "storage_path"),
]


def confirmation_is_valid(phrase: str | None) -> bool:
    return (phrase or "").strip() == CONFIRM_PHRASE


def email_matches_account(provided: str | None, account_email: str | None) -> bool:
    """When the client supplies an email, it must match the signed-in account."""
    if provided is None or not str(provided).strip():
        return True
    if not account_email:
        return False
    return str(provided).strip().lower() == str(account_email).strip().lower()


def collect_user_storage_paths(client, user: CurrentUser) -> dict[str, list[str]]:
    """
    Collect storage object paths owned by the user from DB rows.
    Returns { bucket_name: [path, ...] }.
    """
    uid = str(user.id)
    buckets: dict[str, list[str]] = {
        "candidate-documents": [],
        "candidate-avatars": [],
        "interview-media": [],
    }

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
        except Exception:
            logger.warning("account_delete_path_collect_failed table=%s user_id=%s", table, uid)

    try:
        rows = (
            client.table("interview_responses")
            .select("audio_path,video_path")
            .eq("user_id", uid)
            .execute()
            .data
            or []
        )
        for row in rows:
            _add("interview-media", row.get("audio_path"))
            _add("interview-media", row.get("video_path"))
    except Exception:
        logger.warning("account_delete_path_collect_failed table=interview_responses user_id=%s", uid)

    try:
        profile = client.table("profiles").select("avatar_path").eq("id", uid).limit(1).execute().data or []
        if profile:
            _add("candidate-avatars", profile[0].get("avatar_path"))
    except Exception:
        logger.warning("account_delete_path_collect_failed table=profiles user_id=%s", uid)

    return buckets


def _list_prefix_recursive(admin_client, bucket: str, prefix: str) -> list[str]:
    """Best-effort recursive list under a storage prefix (folder)."""
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
        except Exception:
            continue
        for entry in entries:
            name = (entry or {}).get("name")
            if not name:
                continue
            path = f"{current}/{name}" if current else name
            # Folders often have id=None and no metadata.size
            metadata = (entry or {}).get("metadata") or {}
            is_file = bool(metadata) or (entry or {}).get("id")
            if is_file:
                found.append(path)
            else:
                stack.append(path)
    return found


def purge_user_storage(admin_client, settings: Settings, user: CurrentUser, known_paths: dict[str, list[str]]) -> dict[str, int]:
    """
    Delete storage objects for the user.
    Uses DB-known paths plus recursive listing of {user_id}/ prefixes.
    """
    uid = str(user.id)
    bucket_map = {
        "candidate-documents": settings.document_bucket,
        "candidate-avatars": settings.avatar_bucket,
        "interview-media": settings.interview_bucket,
    }
    removed: dict[str, int] = {key: 0 for key in bucket_map}

    for logical, bucket in bucket_map.items():
        paths = list(known_paths.get(logical) or [])
        # Also wipe anything left under the user's folder prefix.
        try:
            paths.extend(_list_prefix_recursive(admin_client, bucket, uid))
        except Exception:
            logger.warning("account_delete_storage_list_failed bucket=%s user_id=%s", bucket, uid)

        # Deduplicate while preserving order
        unique: list[str] = []
        seen: set[str] = set()
        for path in paths:
            if path and path not in seen:
                seen.add(path)
                unique.append(path)

        # Remove in chunks to keep filesystem work bounded.
        chunk_size = 50
        for index in range(0, len(unique), chunk_size):
            chunk = unique[index : index + chunk_size]
            try:
                admin_client.storage.from_(bucket).remove(chunk)
                removed[logical] += len(chunk)
            except Exception:
                logger.warning(
                    "account_delete_storage_remove_failed bucket=%s count=%s user_id=%s",
                    bucket,
                    len(chunk),
                    uid,
                )
    return removed
