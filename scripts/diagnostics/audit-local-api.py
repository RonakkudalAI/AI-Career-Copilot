"""Exercise the local auth/API/Firestore path with a temporary account."""

import json
import os
import urllib.request
import uuid


def request(base: str, path: str, method: str, payload: dict | None = None, token: str | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(
        urllib.request.Request(f"{base}{path}", data=body, headers=headers, method=method),
        timeout=10,
    ) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else None


def main() -> None:
    base = os.environ.get("CAREER_COPILOT_AUDIT_BASE", "http://127.0.0.1:8000")
    email = f"audit-{uuid.uuid4()}@local.invalid"
    token = None
    try:
        signup = request(
            base,
            "/api/v1/auth/sign-up",
            "POST",
            {"email": email, "password": "AuditPassword123!", "full_name": "Firestore Audit"},
        )
        token = signup["access_token"]
        user_id = signup["user"]["id"]
        profile = request(base, "/api/v1/profile", "GET", token=token)
        updated = request(base, "/api/v1/profile", "PATCH", {"headline": "Firestore audit"}, token=token)
        bootstrap = request(base, "/api/v1/me/bootstrap", "GET", token=token)
        signin = request(
            base,
            "/api/v1/auth/sign-in",
            "POST",
            {"email": email, "password": "AuditPassword123!"},
        )
        health = request(base, "/api/v1/health/database", "GET")
        if (
            profile["profile"]["id"] != user_id
            or updated["id"] != user_id
            or bootstrap["profile"]["id"] != user_id
            or signin["user"]["id"] != user_id
            or health["engine"] != "firestore"
        ):
            raise RuntimeError("API/Firestore ownership or health check failed")
        print(json.dumps({"status": "passed", "engine": health["engine"], "user_id": user_id}))
    finally:
        if token:
            request(
                base,
                "/api/v1/account",
                "DELETE",
                {"confirmation": "DELETE MY ACCOUNT", "email": email},
                token=token,
            )


if __name__ == "__main__":
    main()
