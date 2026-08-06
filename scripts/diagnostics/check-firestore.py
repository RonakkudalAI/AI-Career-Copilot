"""Verify Firebase Firestore + Supabase Storage connectivity."""

import uuid

from app.core.config import get_settings
from app.database.client import database_client


def main() -> None:
    settings = get_settings()
    if not settings.firebase_configured:
        raise SystemExit(
            "Firestore is not configured. Set FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_PATH."
        )
    try:
        client = database_client(settings)
        check_id = str(uuid.uuid4())
        client.table("_setup_checks").insert({"id": check_id, "kind": "startup"}).execute()
        # .single() always returns Result.data as a list of 0..1 rows (stable type).
        rows = (
            client.table("_setup_checks")
            .select("id,kind")
            .eq("id", check_id)
            .single()
            .execute()
            .data
            or []
        )
        row = rows[0] if rows else None
        if not row or row.get("id") != check_id:
            raise RuntimeError("Firestore read-after-write verification returned the wrong document")
        client.table("_setup_checks").delete().eq("id", check_id).execute()

        storage_path = f"_setup_checks/{check_id}.txt"
        client.storage.from_(settings.document_bucket).upload(
            storage_path,
            b"career-copilot-storage-check",
            {"upsert": True, "content_type": "text/plain"},
        )
        downloaded = client.storage.from_(settings.document_bucket).download(storage_path)
        if downloaded != b"career-copilot-storage-check":
            raise RuntimeError("Supabase Storage read-after-write returned unexpected bytes")
        client.storage.from_(settings.document_bucket).remove([storage_path])
    except Exception as exc:
        message = str(exc)
        if "SERVICE_DISABLED" in message or "Cloud Firestore API has not been used" in message:
            raise SystemExit(
                "Cloud Firestore is disabled for this Firebase project. Enable the Firestore API, "
                "create the Firestore database, then rerun npm run setup."
            ) from exc
        if "storage" in message.lower() or "bucket" in message.lower():
            raise SystemExit(
                "Supabase Storage check failed. The configured bucket "
                f"'{settings.supabase_storage_bucket}' does not exist or is not accessible "
                f"for Supabase project '{settings.supabase_url}'. Create the private bucket in Supabase, "
                "copy the bucket name into SUPABASE_STORAGE_BUCKET, then retry. Detail: "
                f"{message}"
            ) from exc
        raise SystemExit(f"Firebase connectivity check failed: {message}") from exc
    print(
        f"firestore_project={settings.firebase_project_id} "
        f"database={settings.firebase_database_id} "
        f"storage_bucket={settings.supabase_storage_bucket} "
        "engine=firestore storage_engine=supabase_storage "
        "write_read=passed cleanup=passed"
    )


if __name__ == "__main__":
    main()
