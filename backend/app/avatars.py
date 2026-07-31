"""Profile picture (avatar) validation and signed URL helpers."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.config import Settings
from app.errors import ApiError

AVATAR_MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
AVATAR_SUFFIX_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _sniff_image_mime(content: bytes) -> str | None:
    if len(content) >= 3 and content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(content) >= 8 and content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_avatar_upload(
    filename: str | None,
    declared_mime: str | None,
    content: bytes,
    max_bytes: int,
) -> str:
    """
    Validate profile picture bytes. Returns canonical MIME type.
    Enforces max size (3 MB by default) and JPEG/PNG/WebP only.
    """
    if not content:
        raise ApiError(400, "empty_avatar", "The selected image is empty.")
    if len(content) > max_bytes:
        raise ApiError(
            413,
            "avatar_too_large",
            f"Profile pictures must be {max_bytes // (1024 * 1024)} MB or smaller.",
        )

    sniffed = _sniff_image_mime(content)
    if not sniffed:
        raise ApiError(
            415,
            "unsupported_avatar_type",
            "Only JPEG, PNG, and WebP profile pictures are supported.",
        )

    suffix = Path(filename or "").suffix.lower()
    suffix_mime = AVATAR_MIME_BY_SUFFIX.get(suffix)
    if suffix and suffix_mime and suffix_mime != sniffed:
        raise ApiError(
            415,
            "avatar_mime_mismatch",
            "The file extension does not match the image content.",
        )

    if declared_mime and declared_mime not in {sniffed, "application/octet-stream", "image/jpg"}:
        # image/jpg is a common non-standard alias for jpeg
        if not (declared_mime == "image/jpg" and sniffed == "image/jpeg"):
            raise ApiError(
                415,
                "avatar_mime_mismatch",
                "The declared image type does not match the file content.",
            )

    return sniffed


def avatar_extension_for_mime(mime: str) -> str:
    return AVATAR_SUFFIX_BY_MIME.get(mime, ".jpg")


def signed_avatar_url(client, settings: Settings, avatar_path: str | None) -> str | None:
    if not avatar_path or not str(avatar_path).strip():
        return None
    try:
        response = client.storage.from_(settings.avatar_bucket).create_signed_url(
            str(avatar_path), settings.export_signed_url_seconds
        )
        return response.get("signedURL") or response.get("signed_url")
    except Exception:
        return None


def attach_avatar_url(profile: dict[str, Any] | None, client, settings: Settings) -> dict[str, Any] | None:
    """Return a shallow copy of profile with avatar_url when a path exists."""
    if not profile:
        return profile
    enriched = dict(profile)
    enriched["avatar_url"] = signed_avatar_url(client, settings, profile.get("avatar_path"))
    return enriched


def safe_avatar_filename(filename: str | None) -> str:
    name = Path(filename or "avatar").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120]
    return cleaned or "avatar"
