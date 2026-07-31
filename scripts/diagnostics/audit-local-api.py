"""Exercise the local auth/API/database path and remove its temporary account."""

import json
import os
import sqlite3
import urllib.request
import uuid
from pathlib import Path

from app.core.config import get_settings


def request(base: str, path: str, method: str, payload: dict | None = None, token: str | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(f"{base}{path}", data=body, headers=headers, method=method), timeout=10) as response:
        return json.loads(response.read().decode())


def main() -> None:
    settings = get_settings()
    base = os.environ.get("CAREER_COPILOT_AUDIT_BASE", "http://127.0.0.1:18004")
    email = f"audit-{uuid.uuid4()}@local.invalid"
    user_id = None
    database_path = Path(settings.database_path).resolve()
    try:
        signup = request(base, "/api/v1/auth/sign-up", "POST", {"email": email, "password": "AuditPassword123!", "full_name": "SQLite Audit"})
        user_id = signup["user"]["id"]
        profile = request(base, "/api/v1/profile", "GET", token=signup["access_token"])
        updated = request(base, "/api/v1/profile", "PATCH", {"headline": "SQLite audit"}, token=signup["access_token"])
        bootstrap = request(base, "/api/v1/me/bootstrap", "GET", token=signup["access_token"])
        signin = request(base, "/api/v1/auth/sign-in", "POST", {"email": email, "password": "AuditPassword123!"})
        health = request(base, "/api/v1/health/database", "GET")
        with sqlite3.connect(database_path) as connection:
            counts = {
                table: connection.execute(f"SELECT count(*) FROM {table} WHERE {column} = ?", (user_id,)).fetchone()[0]
                for table, column in (("users", "id"), ("profiles", "id"), ("candidate_preferences", "user_id"), ("notification_preferences", "user_id"), ("privacy_preferences", "user_id"))
            }
        if profile["profile"]["id"] != user_id or updated["id"] != user_id or bootstrap["profile"]["id"] != user_id or signin["user"]["id"] != user_id or counts != {key: 1 for key in counts}:
            raise RuntimeError(f"API/database ownership check failed: counts={counts}")
        print(json.dumps({"status": "passed", "engine": health["engine"], "user_id": user_id, "row_counts": counts}))
    finally:
        if user_id:
            with sqlite3.connect(database_path) as connection:
                connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
                connection.commit()


if __name__ == "__main__":
    main()
