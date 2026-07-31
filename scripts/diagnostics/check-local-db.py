"""Verify a real SQLite read/write transaction without leaving test data behind."""

import sqlite3
import uuid
from pathlib import Path

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    database_path = Path(settings.database_path).resolve()
    user_id = str(uuid.uuid4())
    email = f"db-check-{user_id}@local.invalid"
    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN")
        connection.execute(
            "INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)",
            (user_id, email, "Database Check", "not-a-real-password"),
        )
        selected_id = connection.execute("SELECT id FROM users WHERE id = ? AND email = ?", (user_id, email)).fetchone()[0]
        if selected_id != user_id:
            raise RuntimeError("SQLite write/read verification returned the wrong row")
        connection.rollback()
    print(f"database={database_path} engine=sqlite write_read=passed rollback=passed")


if __name__ == "__main__":
    main()
