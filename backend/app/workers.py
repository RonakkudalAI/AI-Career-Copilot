from __future__ import annotations

import asyncio

from app.background_jobs import now_iso, publish_job_event, update_job
from app.core.config import get_settings
from app.database.client import database_client
from app.features.document_parsing.pipeline import parse_document_bytes
from app.features.document_parsing.service import safe_filename, sha256_bytes
from app.features.interview.agent import evaluate_interview_answer

try:
    from celery import Celery
except ImportError:  # pragma: no cover - optional worker dependency
    Celery = None  # type: ignore[assignment,misc]

settings = get_settings()

if Celery is not None:
    celery_app = Celery(
        "career_copilot",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=["app.workers"],
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        task_track_started=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        task_time_limit=settings.celery_task_time_limit_seconds,
        task_soft_time_limit=settings.celery_task_soft_time_limit_seconds,
    )
else:
    celery_app = None

    def extract_resume(*_args, **_kwargs):
        raise RuntimeError("Celery is not installed")

    def evaluate_interview(*_args, **_kwargs):
        raise RuntimeError("Celery is not installed")


def worker_available() -> bool:
    return bool(settings.background_jobs_configured and celery_app is not None)


def _record_activity(client, *, user_id: str, action: str, message: str, entity_type: str, entity_id: str) -> None:
    client.table("activity_events").insert(
        {
            "user_id": user_id,
            "action": action,
            "message": message,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "created_at": now_iso(),
        }
    ).execute()


if celery_app is not None:

    @celery_app.task(bind=True, name="career_copilot.extract_resume", max_retries=2)
    def extract_resume(self, job_id: str):
        worker_settings = get_settings()
        client = database_client(worker_settings)
        rows = client.table("background_jobs").select("*").eq("id", job_id).limit(1).execute().data or []
        if not rows:
            return {"job_id": job_id, "status": "missing"}
        job = rows[0]
        payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}

        def mark(status: str, progress: int, *, result=None, error=None):
            nonlocal job
            job = update_job(client, job_id, status=status, progress=progress, result=result, error=error)
            publish_job_event(worker_settings, job)

        try:
            mark("running", 10)
            content = client.storage.from_(worker_settings.document_bucket).download(str(payload["storage_path"]))
            mark("running", 35)
            text, structured = asyncio.run(
                parse_document_bytes(
                    content,
                    mime_type=str(payload["mime_type"]),
                    settings=worker_settings,
                    schema_version="resume-extraction-v1",
                )
            )
            mark("running", 80)
            record = {
                "id": str(payload["version_id"]),
                "resume_id": str(payload["resume_id"]),
                "user_id": str(job["user_id"]),
                "version_number": int(payload["version_number"]),
                "source_type": "uploaded",
                "original_filename": safe_filename(str(payload["filename"])),
                "storage_path": str(payload["storage_path"]),
                "mime_type": str(payload["mime_type"]),
                "size_bytes": len(content),
                "sha256": sha256_bytes(content),
                "plain_text": text,
                "structured_content": structured,
                "extraction_status": "review_required",
                "extraction_warnings": list(structured.get("warnings") or []),
                "created_at": now_iso(),
            }
            client.table("resume_versions").insert(record).execute()
            _record_activity(
                client,
                user_id=str(job["user_id"]),
                action="resume_uploaded",
                message="Resume uploaded",
                entity_type="resume",
                entity_id=str(payload["resume_id"]),
            )
            result = {"resume_id": str(payload["resume_id"]), "version_id": str(payload["version_id"])}
            mark("completed", 100, result=result)
            return result
        except Exception as exc:
            if getattr(self.request, "retries", 0) < self.max_retries:
                mark("retrying", 10, error=f"{type(exc).__name__}: retry scheduled")
                raise self.retry(exc=exc, countdown=5) from exc
            mark("failed", 100, error=f"{type(exc).__name__}: resume processing failed")
            raise

    @celery_app.task(bind=True, name="career_copilot.evaluate_interview_answer", max_retries=2)
    def evaluate_interview(self, job_id: str):
        worker_settings = get_settings()
        client = database_client(worker_settings)
        rows = client.table("background_jobs").select("*").eq("id", job_id).limit(1).execute().data or []
        if not rows:
            return {"job_id": job_id, "status": "missing"}
        job = rows[0]
        payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}

        def mark(status: str, progress: int, *, result=None, error=None):
            nonlocal job
            job = update_job(client, job_id, status=status, progress=progress, result=result, error=error)
            publish_job_event(worker_settings, job)

        try:
            mark("running", 10)
            session_id = str(payload["session_id"])
            question_id = str(payload["question_id"])
            user_id = str(job["user_id"])
            question_rows = (
                client.table("interview_questions")
                .select("id,question,question_type,position")
                .eq("id", question_id)
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not question_rows:
                raise ValueError("Interview question is no longer available")
            question = question_rows[0]
            session_rows = (
                client.table("interview_sessions")
                .select("target_role,mode")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            session = session_rows[0] if session_rows else {}
            answer_text = str(payload.get("transcript") or payload.get("typed_response") or "").strip()
            client_speech = payload.get("speech_metrics") if isinstance(payload.get("speech_metrics"), dict) else None
            client_gaze = payload.get("gaze_metrics") if isinstance(payload.get("gaze_metrics"), dict) else None
            evaluation = asyncio.run(
                evaluate_interview_answer(
                    worker_settings,
                    question=str(question.get("question") or ""),
                    answer=answer_text,
                    question_type=question.get("question_type"),
                    target_role=session.get("target_role"),
                    mode=session.get("mode"),
                    duration_seconds=payload.get("duration_seconds"),
                    gaze_metrics=client_gaze,
                )
            )
            if client_speech and not evaluation.get("speaking_delivery", {}).get("duration_seconds"):
                raw_duration = client_speech.get("duration_seconds")
                try:
                    if raw_duration is not None and float(raw_duration) > 0:
                        from app.features.interview.agent.evaluator import analyze_speaking_delivery

                        evaluation["speaking_delivery"] = analyze_speaking_delivery(answer_text, float(raw_duration))
                except (TypeError, ValueError):
                    pass
            mark("running", 80)
            row = {
                "question_id": question_id,
                "typed_response": payload.get("typed_response"),
                "transcript": payload.get("transcript"),
                "duration_seconds": payload.get("duration_seconds"),
                "speech_metrics": client_speech,
                "gaze_metrics": evaluation.get("gaze_metrics") or client_gaze,
                "session_id": session_id,
                "user_id": user_id,
                "created_at": now_iso(),
                "evaluation": evaluation,
                "score": evaluation.get("score"),
                "verdict": evaluation.get("verdict"),
                "filler_analysis": evaluation.get("filler_analysis") or {},
                "speaking_delivery": evaluation.get("speaking_delivery") or {},
            }
            saved = client.table("interview_responses").insert(row).execute().data[0]
            result = {
                "response": saved,
                "evaluation": evaluation,
                "question": {
                    "id": question.get("id"),
                    "position": question.get("position"),
                    "question": question.get("question"),
                    "question_type": question.get("question_type"),
                },
            }
            _record_activity(
                client,
                user_id=user_id,
                action="interview_answer_submitted",
                message="Interview answer evaluated",
                entity_type="interview_session",
                entity_id=session_id,
            )
            mark("completed", 100, result=result)
            return result
        except Exception as exc:
            if getattr(self.request, "retries", 0) < self.max_retries:
                mark("retrying", 10, error=f"{type(exc).__name__}: retry scheduled")
                raise self.retry(exc=exc, countdown=5) from exc
            mark("failed", 100, error=f"{type(exc).__name__}: interview evaluation failed")
            raise
