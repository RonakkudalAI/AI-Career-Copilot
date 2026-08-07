from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.config import Settings

TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def create_job(client, *, user_id: str, job_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(uuid4())
    now = now_iso()
    row = {
        "id": job_id,
        "user_id": user_id,
        "job_type": job_type,
        "status": "queued",
        "progress": 0,
        "payload": payload,
        "result": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    return client.table("background_jobs").insert(row).execute().data[0]


def update_job(client, job_id: str, *, status: str, progress: int, result: Any = None, error: str | None = None) -> dict[str, Any]:
    updates = {
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "updated_at": now_iso(),
        "result": result,
        "error": error,
    }
    rows = client.table("background_jobs").update(updates).eq("id", job_id).execute().data or []
    return rows[0] if rows else {"id": job_id, **updates}


def public_job(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "job_type": row.get("job_type"),
        "status": row.get("status"),
        "progress": int(row.get("progress") or 0),
        "result": row.get("result"),
        "error": row.get("error"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def publish_job_event(settings: Settings, job: dict[str, Any]) -> None:
    try:
        import redis

        connection = redis.Redis.from_url(settings.celery_broker_url, decode_responses=True)
        connection.publish(f"career-copilot:job:{job.get('id')}", json.dumps(public_job(job)))
        connection.close()
    except Exception:
        # Firestore remains the source of truth; event delivery is best effort.
        return
