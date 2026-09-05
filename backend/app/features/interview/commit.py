from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.core.errors import ApiError
from app.features.interview.agent.evaluator import (
    INTERVIEW_REPORT_VERSION,
    _deterministic_session_report,
    evaluate_answer_offline,
    generate_interview_session_report,
)

logger = logging.getLogger(__name__)


def _clean_text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


async def commit_live_interview(
    client,
    settings: Settings,
    user: Any,
    *,
    session_fields: dict[str, Any],
    questions_in: list[dict[str, Any]],
    responses_in: list[dict[str, Any]],
    now: str,
) -> dict[str, Any]:
    """Persist a finished live interview in one shot: session, questions, answers, report.

    The live round never writes to the database. Agents run here, after the
    candidate is done, so the conversation is not blocked on LLM or Firestore.
    """
    if not questions_in:
        raise ApiError(422, "empty_interview_session", "The session has no questions to save.")

    uid = str(user.id)
    session_id = str(uuid4())
    planned = max(1, min(int(session_fields.get("question_count") or len(questions_in)), 20))
    session_row = {
        **session_fields,
        "id": session_id,
        "user_id": uid,
        "created_at": now,
        "started_at": now,
        "completed_at": now,
        "status": "completed",
        "question_count": planned,
    }
    saved_session = client.table("interview_sessions").insert(session_row).execute().data[0]

    question_rows: list[dict[str, Any]] = []
    position_to_id: dict[int, str] = {}
    for index, item in enumerate(sorted(questions_in, key=lambda row: int(row.get("position") or 0)), start=1):
        qid = str(uuid4())
        position = int(item.get("position") or index)
        source = item.get("source_context") if isinstance(item.get("source_context"), dict) else {}
        question_rows.append(
            {
                "id": qid,
                "user_id": uid,
                "session_id": session_id,
                "position": position,
                "question": str(item.get("question") or "").strip()[:800],
                "question_type": str(item.get("question_type") or session_fields.get("mode") or "mixed")[:80],
                "source_context": {
                    **source,
                    "provider": source.get("provider") or "live_bank",
                },
                "created_at": now,
            }
        )
        position_to_id[position] = qid
    if question_rows:
        client.table("interview_questions").insert(question_rows).execute()

    response_rows: list[dict[str, Any]] = []
    turns: list[dict[str, Any]] = []
    for item in responses_in:
        position = int(item.get("position") or 0)
        question_id = position_to_id.get(position)
        if not question_id:
            continue
        question = next((row for row in question_rows if row["id"] == question_id), None)
        if not question:
            continue
        answer_text = (item.get("transcript") or item.get("typed_response") or "").strip()
        duration = item.get("duration_seconds")
        gaze = item.get("gaze_metrics") if isinstance(item.get("gaze_metrics"), dict) else None
        evaluation = evaluate_answer_offline(
            answer_text,
            str(question.get("question") or ""),
            duration_seconds=duration,
            gaze_metrics=gaze,
        )
        response_rows.append(
            {
                "id": str(uuid4()),
                "question_id": question_id,
                "typed_response": _clean_text(item.get("typed_response"), 20_000),
                "transcript": _clean_text(item.get("transcript"), 50_000),
                "duration_seconds": duration,
                "speech_metrics": item.get("speech_metrics") if isinstance(item.get("speech_metrics"), dict) else None,
                "gaze_metrics": evaluation.get("gaze_metrics") or gaze,
                "session_id": session_id,
                "user_id": uid,
                "created_at": now,
                "evaluation": evaluation,
                "score": evaluation.get("score"),
                "verdict": evaluation.get("verdict"),
                "filler_analysis": evaluation.get("filler_analysis") or {},
                "speaking_delivery": evaluation.get("speaking_delivery") or {},
            }
        )
        turns.append(
            {
                "question_id": question_id,
                "position": position,
                "question": question.get("question"),
                "question_type": question.get("question_type"),
                "answer": answer_text,
                "evaluation": evaluation,
                "gaze_metrics": evaluation.get("gaze_metrics"),
            }
        )
    if response_rows:
        client.table("interview_responses").insert(response_rows).execute()

    if not turns:
        raise ApiError(422, "empty_interview_session", "Complete at least one answered question before saving.")

    report_body: dict[str, Any]
    try:
        report_body = await generate_interview_session_report(
            settings,
            turns=turns,
            target_role=session_fields.get("target_role"),
            mode=session_fields.get("mode"),
        )
    except Exception as exc:
        logger.warning("interview_commit_report_llm_failed reason=%s", type(exc).__name__)
        report_body = _deterministic_session_report(
            turns, target_role=session_fields.get("target_role")
        )
        report_body["generation_status"] = "evidence_only_ai_unavailable"
        report_body["report_version"] = INTERVIEW_REPORT_VERSION

    report_row = {
        "user_id": uid,
        "session_id": session_id,
        "created_at": now,
        "status": "ready",
        "overall_score": report_body.get("overall_score"),
        "communication_score": report_body.get("communication_score"),
        "structure_score": report_body.get("structure_score"),
        "content_score": report_body.get("content_score"),
        "summary": report_body.get("overall_summary"),
        "report": report_body,
        "provider": report_body.get("provider"),
        "model": report_body.get("model"),
        "report_version": report_body.get("report_version") or INTERVIEW_REPORT_VERSION,
    }
    saved_report = client.table("interview_reports").insert(report_row).execute().data[0]
    return {
        "session": saved_session,
        "report": saved_report,
        "questions": question_rows,
        "message": "Session saved. Review your detailed debrief report.",
    }
