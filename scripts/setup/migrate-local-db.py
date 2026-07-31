"""Create or update the local SQLite database from the checked-in schema."""

import sqlite3
from pathlib import Path

from app.core.config import get_settings


def clear_missing_avatar_references(connection: sqlite3.Connection, avatar_root: Path) -> int:
    """Clear database paths whose local avatar file is absent or outside its bucket."""
    stale_profile_ids: list[str] = []
    rows = connection.execute(
        "SELECT id, avatar_path FROM profiles WHERE avatar_path IS NOT NULL AND TRIM(avatar_path) <> ''"
    ).fetchall()
    for profile_id, avatar_path in rows:
        relative = Path(str(avatar_path))
        if relative.is_absolute() or ".." in relative.parts:
            stale_profile_ids.append(str(profile_id))
            continue
        target = (avatar_root / relative).resolve()
        if avatar_root not in target.parents or not target.is_file():
            stale_profile_ids.append(str(profile_id))

    if stale_profile_ids:
        connection.executemany(
            "UPDATE profiles SET avatar_path = NULL WHERE id = ?",
            [(profile_id,) for profile_id in stale_profile_ids],
        )
    return len(stale_profile_ids)


def main() -> None:
    settings = get_settings()
    database_path = Path(settings.database_path).resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    storage_root = Path(settings.local_storage_dir).resolve()
    for bucket in (settings.document_bucket, settings.avatar_bucket, settings.interview_bucket):
        (storage_root / bucket).mkdir(parents=True, exist_ok=True)
    avatar_root = (storage_root / settings.avatar_bucket).resolve()
    schema_path = Path(__file__).resolve().parents[2] / "db" / "schema.sql"
    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.executescript(schema_path.read_text(encoding="utf-8"))
        cleared_avatar_references = clear_missing_avatar_references(connection, avatar_root)
    print(f"Applied SQLite schema to {database_path}")
    if cleared_avatar_references:
        print(f"Cleared {cleared_avatar_references} missing local avatar reference(s).")


if __name__ == "__main__":
    main()
