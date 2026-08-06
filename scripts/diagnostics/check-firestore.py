"""Verify that the configured Firebase Firestore connection can read and write."""

import uuid

from app.core.config import get_settings
from app.database.client import database_client


def main() -> None:
    settings = get_settings()
    try:
        client = database_client(settings)
        check_id = str(uuid.uuid4())
        client.table("_setup_checks").insert({"id": check_id, "kind": "startup"}).execute()
        row = client.table("_setup_checks").select("id,kind").eq("id", check_id).single().execute().data
        if not row or row.get("id") != check_id:
            raise RuntimeError("Firestore read-after-write verification returned the wrong document")
        client.table("_setup_checks").delete().eq("id", check_id).execute()
    except Exception as exc:
        message = str(exc)
        if "SERVICE_DISABLED" in message or "Cloud Firestore API has not been used" in message:
            raise SystemExit(
                "Cloud Firestore is disabled for this Firebase project. Enable the Firestore API, "
                "create the Firestore database, then rerun npm run setup."
            ) from exc
        raise SystemExit(f"Firestore connectivity check failed: {message}") from exc
    print(
        f"firestore_project={settings.firebase_project_id} database={settings.firebase_database_id} "
        "engine=firestore write_read=passed cleanup=passed"
    )


if __name__ == "__main__":
    main()
