from __future__ import annotations

import re

USERNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])?$")


def normalize_username(value: str | None) -> str:
    return str(value or "").strip().lower().lstrip("@").replace(" ", "_")


def validate_username(value: str | None) -> str:
    username = normalize_username(value)
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("Username must be 3–30 characters using lowercase letters, numbers, and underscores.")
    return username
