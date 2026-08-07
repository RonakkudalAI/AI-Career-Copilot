
from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.providers.groq_client import GroqClient
from app.core.config import Settings

logger = logging.getLogger(__name__)
INTERVIEW_REPORT_VERSION = "evidence-report-v2"

# Common English fillers / hedge tokens for speech-habit detection.
_FILLER_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (label, re.compile(rf"\b{re.escape(label)}\b", re.I))
    for label in (
        "um",
        "uh",
        "uhm",
        "er",
        "ah",
        "like",
        "you know",
        "i mean",
        "sort of",
        "kind of",
        "basically",
        "actually",
        "literally",
        "right",
        "so yeah",
        "and stuff",
    )
)

_STAR_MARKERS = (
    "situation",
    "task",
    "action",
    "result",
    "because",
    "i led",
    "i owned",
    "we shipped",
    "impact",
    "outcome",
    "measured",
)


class AnswerEvaluationResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    verdict: str = Field(min_length=3, max_length=40)
    score: int = Field(ge=0, le=100)
    interviewer_feedback: str = Field(min_length=20, max_length=2000)
    strengths: list[str] = Field(default_factory=list, max_length=8)
    improvements: list[str] = Field(default_factory=list, max_length=8)
    better_approach: str = Field(default="", max_length=2000)
    filler_notes: str = Field(default="", max_length=600)


class SessionReportResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    overall_summary: str = Field(min_length=20, max_length=3000)
    overall_score: int = Field(ge=0, le=100)
    communication_score: int = Field(ge=0, le=100)
    structure_score: int = Field(ge=0, le=100)
    content_score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list, max_length=10)
    improvements: list[str] = Field(default_factory=list, max_length=10)
    practice_plan: list[str] = Field(default_factory=list, max_length=10)
    filler_summary: str = Field(default="", max_length=1000)


def analyze_filler_words(text: str) -> dict[str, Any]:
    """Deterministic filler / hedge detection from transcript text."""
    raw = (text or "").strip()
    if not raw:
        return {
            "total_count": 0,
            "unique": [],
            "counts": {},
            "word_count": 0,
            "filler_rate": 0.0,
            "notes": "No answer text to analyze.",
        }
    words = re.findall(r"[A-Za-z']+", raw.lower())
    word_count = max(len(words), 1)
    counts: dict[str, int] = {}
    total = 0
    for label, pattern in _FILLER_PATTERNS:
        hits = pattern.findall(raw)
        if hits:
            counts[label] = len(hits)
            total += len(hits)
    rate = round(total / word_count, 4)
    if total == 0:
        notes = "No common filler phrases detected in this answer."
    elif rate >= 0.08:
        notes = (
            f"High filler density ({total} fillers across ~{word_count} words). "
            "Slow down and replace fillers with a short pause."
        )
    elif rate >= 0.03:
        notes = (
            f"Some fillers detected ({total}). "
            "A brief pause is cleaner than 'um' / 'like' while you think."
        )
    else:
        notes = f"Light filler use ({total}). Keep answers deliberate."
    return {
        "total_count": total,
        "unique": sorted(counts.keys()),
        "counts": counts,
        "word_count": word_count,
        "filler_rate": rate,
        "notes": notes,
    }


def analyze_speaking_delivery(
    text: str,
    duration_seconds: float | int | None = None,
) -> dict[str, Any]:
    """Deterministic pace + delivery metrics from transcript and optional duration.

    Does not invent content — only measures words present and elapsed seconds when provided.
    Interview pace bands are coaching heuristics, not hiring decisions.
    """
    fillers = analyze_filler_words(text)
    word_count = int(fillers.get("word_count") or 0)
    duration: float | None
    try:
        duration = float(duration_seconds) if duration_seconds is not None else None
    except (TypeError, ValueError):
        duration = None
    if duration is not None and duration < 0:
        duration = None

    words_per_minute: float | None = None
    if duration and duration >= 1.0 and word_count > 0:
        words_per_minute = round((word_count / duration) * 60.0, 1)

    # Conversational interview band ~110–160 wpm; outside is coaching signal only.
    if words_per_minute is None:
        pace_band = "unknown"
        pace_notes = (
            "Speaking pace could not be measured (need a timed spoken answer of at least 1 second)."
        )
    elif words_per_minute < 90:
        pace_band = "slow"
        pace_notes = (
            f"Pace is deliberate (~{words_per_minute} wpm). "
            "Fine if thoughtful; add a tighter close so answers do not trail off."
        )
    elif words_per_minute <= 165:
        pace_band = "steady"
        pace_notes = (
            f"Pace is interview-friendly (~{words_per_minute} wpm). "
            "Keep short pauses instead of fillers."
        )
    elif words_per_minute <= 200:
        pace_band = "fast"
        pace_notes = (
            f"Pace is quick (~{words_per_minute} wpm). "
            "Slow 10–15% and breathe between STAR beats so the interviewer can follow."
        )
    else:
        pace_band = "rushed"
        pace_notes = (
            f"Pace is rushed (~{words_per_minute} wpm). "
            "Consciously pause after the situation and before the result."
        )

    return {
        "word_count": word_count,
        "duration_seconds": round(duration, 2) if duration is not None else None,
        "words_per_minute": words_per_minute,
        "pace_band": pace_band,
        "pace_notes": pace_notes,
        "filler_count": int(fillers.get("total_count") or 0),
        "filler_rate": fillers.get("filler_rate") or 0.0,
        "filler_notes": fillers.get("notes") or "",
        "filler_counts": fillers.get("counts") or {},
    }


def normalize_gaze_metrics(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate client gaze metrics without inventing camera measurements."""
    if not isinstance(raw, dict) or not raw:
        return None
    try:
        looking = max(0, int(raw.get("looking_samples") or 0))
        away = max(0, int(raw.get("away_samples") or 0))
        no_face = max(0, int(raw.get("no_face_samples") or 0))
        sample_count = max(0, int(raw.get("sample_count") or (looking + away + no_face)))
    except (TypeError, ValueError):
        return None
    usable = looking + away + no_face
    if usable <= 0 and sample_count <= 0:
        detector = str(raw.get("detector") or "unavailable")
        return {
            "sample_count": sample_count,
            "looking_samples": 0,
            "away_samples": 0,
            "no_face_samples": 0,
            "looking_ratio": None,
            "looking_seconds": float(raw.get("looking_seconds") or 0) or 0.0,
            "away_seconds": float(raw.get("away_seconds") or 0) or 0.0,
            "eye_contact_score": None,
            "band": "unknown",
            "notes": str(raw.get("notes") or "No gaze samples recorded.")[:600],
            "detector": detector[:40],
        }
    looking_ratio = round(looking / usable, 4) if usable else None
    score = int(round(looking_ratio * 100)) if looking_ratio is not None else None
    if score is None:
        band = "unknown"
    elif score >= 70:
        band = "strong"
    elif score >= 40:
        band = "mixed"
    else:
        band = "weak"
    notes = str(raw.get("notes") or "").strip()
    if not notes and score is not None:
        notes = f"Camera presence ~{score}% of tracked answer time."
    return {
        "sample_count": sample_count or usable,
        "looking_samples": looking,
        "away_samples": away,
        "no_face_samples": no_face,
        "looking_ratio": looking_ratio,
        "looking_seconds": float(raw.get("looking_seconds") or 0) or None,
        "away_seconds": float(raw.get("away_seconds") or 0) or None,
        "eye_contact_score": score,
        "band": band,
        "notes": (notes or "Gaze metrics recorded.")[:600],
        "detector": str(raw.get("detector") or "face_detector")[:40],
    }


def practice_readiness_recommendation(
    *,
    overall_score: int,
    communication_score: int,
    structure_score: int,
    content_score: int,
    filler_rate: float = 0.0,
    eye_contact_score: int | None = None,
) -> dict[str, Any]:
    """Practice-only readiness band from measured scores — not an employment hiring decision.

    Product rule: never claim the candidate will or will not be hired by a real employer.
    """
    overall = max(0, min(100, int(overall_score)))
    communication = max(0, min(100, int(communication_score)))
    structure = max(0, min(100, int(structure_score)))
    content = max(0, min(100, int(content_score)))
    composite = round((overall * 0.4) + (content * 0.25) + (structure * 0.2) + (communication * 0.15))
    # Optional camera presence slightly adjusts composite when measured (never invents gaze).
    if eye_contact_score is not None:
        eye = max(0, min(100, int(eye_contact_score)))
        composite = round(composite * 0.9 + eye * 0.1)

    if composite >= 75 and filler_rate < 0.08:
        band = "ready_to_interview"
        label = "Strong practice readiness"
        next_step = (
            "You are practice-ready for live interviews at this difficulty. "
            "Keep one STAR story bank and rehearse pacing under time."
        )
    elif composite >= 55:
        band = "needs_targeted_practice"
        label = "Developing — targeted practice recommended"
        next_step = (
            "Close the gap on your lowest dimension before real interviews. "
            "Re-answer the weakest question with situation → action → result."
        )
    else:
        band = "build_fundamentals"
        label = "Foundations first"
        next_step = (
            "Build longer, specific answers with clear ownership language. "
            "Practice three full answers aloud and reduce fillers before scheduling real screens."
        )
    if eye_contact_score is not None and eye_contact_score < 40:
        next_step = (
            f"{next_step} Also keep your face framed and look into the camera — "
            "looking away while answering is best avoided."
        )

    return {
        "band": band,
        "label": label,
        "composite_score": composite,
        "next_step": next_step,
        # Explicit non-hire wording for UI + API consumers.
        "disclaimer": (
            "Practice coaching only. This is not a hiring decision and does not predict "
            "whether any employer will hire the candidate."
        ),
        "dimension_scores": {
            "overall": overall,
            "communication": communication,
            "structure": structure,
            "content": content,
            "eye_contact": eye_contact_score,
        },
    }


def _score_answer_heuristic(
    answer: str,
    question: str,
    *,
    duration_seconds: float | int | None = None,
) -> dict[str, Any]:
    text = (answer or "").strip()
    q = (question or "").strip().lower()
    words = re.findall(r"[A-Za-z']+", text.lower())
    word_count = len(words)
    fillers = analyze_filler_words(text)
    delivery = analyze_speaking_delivery(text, duration_seconds)
    lower = text.lower()
    star_hits = sum(1 for marker in _STAR_MARKERS if marker in lower)
    has_i = bool(re.search(r"\bi\b", lower))
    has_example = any(token in lower for token in ("for example", "for instance", "when i", "one time", "recently"))
    q_tokens = {t for t in re.findall(r"[a-z]{4,}", q) if t not in {"tell", "about", "what", "when", "where", "would", "could", "this", "that", "with", "your", "from"}}
    overlap = sum(1 for t in q_tokens if t in lower) if q_tokens else 0
    relevance = min(30, overlap * 4)

    score = 35
    if word_count >= 40:
        score += 15
    if word_count >= 80:
        score += 10
    if star_hits >= 2:
        score += 15
    elif star_hits == 1:
        score += 8
    if has_i:
        score += 5
    if has_example:
        score += 10
    score += relevance
    # Penalize heavy fillers
    if fillers["filler_rate"] >= 0.08:
        score -= 12
    elif fillers["filler_rate"] >= 0.03:
        score -= 6
    # Mild coaching adjustment for extreme pace when duration is known.
    if delivery.get("pace_band") == "rushed":
        score -= 6
    elif delivery.get("pace_band") == "fast":
        score -= 3
    if word_count < 12:
        score = min(score, 28)
    score = max(0, min(100, score))

    if score >= 75:
        verdict = "strong"
    elif score >= 55:
        verdict = "solid"
    elif score >= 40:
        verdict = "partial"
    else:
        verdict = "weak"

    strengths: list[str] = []
    improvements: list[str] = []
    if word_count >= 40:
        strengths.append("Answer has enough length to cover context.")
    if has_example or star_hits:
        strengths.append("Includes concrete experience or outcome language.")
    if fillers["total_count"] == 0:
        strengths.append("Speech is relatively free of common fillers.")
    if not strengths:
        strengths.append("You engaged with the question.")

    if word_count < 40:
        improvements.append("Expand with a brief situation, what you did, and the result.")
    if star_hits < 2 and ("tell me about" in q or "time" in q or "example" in q):
        improvements.append("Use a tighter STAR structure: situation → action → result.")
    if fillers["total_count"] > 0:
        improvements.append(fillers["notes"])
    if delivery.get("pace_band") in {"fast", "rushed"}:
        improvements.append(str(delivery.get("pace_notes") or "Slow your speaking pace slightly."))
    if not has_example and word_count >= 20:
        improvements.append("Anchor the answer in one specific project or decision.")
    if not improvements:
        improvements.append("Close with the measurable impact of your action.")

    better = (
        "Open with the situation in one sentence, state the action you owned, "
        "then finish with a clear result or learning. Pause instead of filler words."
    )
    feedback = (
        f"As an interviewer: this answer reads as {verdict} ({score}/100). "
        f"{fillers['notes']} "
        f"{delivery.get('pace_notes') or ''} "
        + (" ".join(improvements[:2]) if improvements else "Keep the structure crisp.")
    )
    return {
        "verdict": verdict,
        "score": score,
        "interviewer_feedback": feedback[:2000],
        "strengths": strengths[:8],
        "improvements": improvements[:8],
        "better_approach": better,
        "filler_notes": fillers["notes"],
        "filler_analysis": fillers,
        "speaking_delivery": delivery,
        "provider": "deterministic",
        "model": None,
    }


async def evaluate_interview_answer(
    settings: Settings,
    *,
    question: str,
    answer: str,
    question_type: str | None = None,
    target_role: str | None = None,
    mode: str | None = None,
    duration_seconds: float | int | None = None,
    gaze_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Evaluate one answer: deterministic base + optional Groq interviewer voice."""
    base = _score_answer_heuristic(answer, question, duration_seconds=duration_seconds)
    fillers = base["filler_analysis"]
    delivery = base.get("speaking_delivery") or analyze_speaking_delivery(answer, duration_seconds)
    gaze = normalize_gaze_metrics(gaze_metrics)
    if gaze and gaze.get("eye_contact_score") is not None and int(gaze["eye_contact_score"]) < 40:
        improvements = list(base.get("improvements") or [])
        tip = "Look into the camera while answering — avoid looking down or off-screen."
        if tip not in improvements:
            improvements.append(tip)
        base["improvements"] = improvements[:8]
        base["interviewer_feedback"] = (
            f"{base.get('interviewer_feedback') or ''} {gaze.get('notes') or tip}"
        ).strip()[:2000]
    if not (answer or "").strip():
        return {
            **base,
            "verdict": "weak",
            "score": 0,
            "interviewer_feedback": "No answer was captured. Share a specific example next time.",
            "strengths": [],
            "improvements": ["Provide a spoken or typed answer before saving."],
            "speaking_delivery": delivery,
            "gaze_metrics": gaze,
        }

    if not settings.groq_configured:
        return {**base, "gaze_metrics": gaze}

    try:
        from pathlib import Path

        prompt_path = Path(__file__).resolve().parents[3] / "agents" / "prompts" / "interview_answer_eval_v1.txt"
        system_prompt = prompt_path.read_text(encoding="utf-8")
        client = GroqClient(settings)
        result: AnswerEvaluationResult = await client.generate_structured(
            system_prompt=system_prompt,
            user_payload={
                "question": question,
                "answer": (answer or "")[:8000],
                "question_type": question_type,
                "target_role": target_role,
                "mode": mode,
                "filler_analysis": {
                    "total_count": fillers.get("total_count"),
                    "counts": fillers.get("counts"),
                    "notes": fillers.get("notes"),
                },
                "speaking_delivery": {
                    "words_per_minute": delivery.get("words_per_minute"),
                    "pace_band": delivery.get("pace_band"),
                    "pace_notes": delivery.get("pace_notes"),
                    "duration_seconds": delivery.get("duration_seconds"),
                },
                "gaze_metrics": gaze,
            },
            schema_model=AnswerEvaluationResult,
        )
        verdict = (result.verdict or base["verdict"]).strip()[:40]
        feedback = (result.interviewer_feedback or base["interviewer_feedback"]).strip()[:2000]
        strengths = list(result.strengths) if result.strengths is not None else list(base["strengths"])
        improvements = list(result.improvements) if result.improvements is not None else list(base["improvements"])
        better = (result.better_approach if result.better_approach is not None else base["better_approach"]).strip()[:2000]
        filler_notes = (result.filler_notes if result.filler_notes is not None else base["filler_notes"]).strip()[:600]
        return {
            "verdict": verdict,
            "score": int(result.score),
            "interviewer_feedback": feedback,
            "strengths": strengths[:8],
            "improvements": improvements[:8],
            "better_approach": better,
            "filler_notes": filler_notes,
            "filler_analysis": fillers,
            "speaking_delivery": delivery,
            "gaze_metrics": gaze,
            "provider": "groq",
            "model": settings.groq_model,
            "agent": "interview_evaluation",
        }
    except Exception as exc:
        logger.warning("interview_answer_eval_failed reason=%s", type(exc).__name__)
        return {**base, "gaze_metrics": gaze, "fallback": True, "fallback_reason": type(exc).__name__}


def _deterministic_session_report(
    turns: list[dict[str, Any]],
    *,
    target_role: str | None,
) -> dict[str, Any]:
    if not turns:
        readiness = practice_readiness_recommendation(
            overall_score=0,
            communication_score=0,
            structure_score=0,
            content_score=0,
            filler_rate=0.0,
            eye_contact_score=None,
        )
        return {
            "overall_summary": "No answers were recorded for this session.",
            "overall_score": 0,
            "communication_score": 0,
            "structure_score": 0,
            "content_score": 0,
            "strengths": [],
            "improvements": ["Complete at least one question with a full answer."],
            "practice_plan": ["Re-run a short session and answer every question fully."],
            "filler_summary": "No transcripts to analyze.",
            "speaking_summary": {
                "average_words_per_minute": None,
                "total_fillers": 0,
                "total_words": 0,
                "filler_rate": 0.0,
                "answers_with_pace": 0,
            },
            "gaze_summary": {
                "average_eye_contact_score": None,
                "looking_samples": 0,
                "away_samples": 0,
                "answers_with_gaze": 0,
                "notes": "No camera gaze samples — complete answers with the camera enabled.",
            },
            "practice_readiness": readiness,
            "score_series": [],
            "question_reviews": [],
            "provider": "deterministic",
            "model": None,
        }

    scores = [int(t.get("evaluation", {}).get("score") or 0) for t in turns]
    overall = int(round(sum(scores) / len(scores))) if scores else 0
    total_fillers = 0
    word_total = 0
    for turn in turns:
        fa = (turn.get("evaluation") or {}).get("filler_analysis") or {}
        total_fillers += int(fa.get("total_count") or 0)
        word_total += int(fa.get("word_count") or 0)
    rate = (total_fillers / word_total) if word_total else 0.0
    communication = max(0, min(100, 88 - int(rate * 400)))
    structure = overall
    content = overall

    # Aggregate measured pace (only from turns that have duration).
    wpm_values: list[float] = []
    eye_scores: list[int] = []
    looking_samples = 0
    away_samples = 0
    gaze_notes: list[str] = []
    for turn in turns:
        evaluation = turn.get("evaluation") or {}
        delivery = evaluation.get("speaking_delivery") or {}
        wpm = delivery.get("words_per_minute")
        if isinstance(wpm, (int, float)) and wpm > 0:
            wpm_values.append(float(wpm))
        gaze = normalize_gaze_metrics(evaluation.get("gaze_metrics") or turn.get("gaze_metrics"))
        if gaze and gaze.get("eye_contact_score") is not None:
            eye_scores.append(int(gaze["eye_contact_score"]))
            looking_samples += int(gaze.get("looking_samples") or 0)
            away_samples += int(gaze.get("away_samples") or 0)
            if gaze.get("notes"):
                gaze_notes.append(str(gaze["notes"]))
    avg_wpm = round(sum(wpm_values) / len(wpm_values), 1) if wpm_values else None
    avg_eye = int(round(sum(eye_scores) / len(eye_scores))) if eye_scores else None
    gaze_summary = {
        "average_eye_contact_score": avg_eye,
        "looking_samples": looking_samples,
        "away_samples": away_samples,
        "answers_with_gaze": len(eye_scores),
        "notes": (
            gaze_notes[0]
            if gaze_notes
            else (
                "No camera gaze samples were recorded (enable camera + Chrome/Edge FaceDetector)."
                if not eye_scores
                else f"Average camera presence ~{avg_eye}% across timed answers."
            )
        ),
    }

    strengths: list[str] = []
    improvements: list[str] = []
    for turn in turns:
        evaluation = turn.get("evaluation") or {}
        for item in evaluation.get("strengths") or []:
            if item not in strengths:
                strengths.append(str(item))
        for item in evaluation.get("improvements") or []:
            if item not in improvements:
                improvements.append(str(item))
    strengths = strengths[:8] or ["You completed the practice set."]
    improvements = improvements[:8] or ["Add clearer results to each answer."]
    role = (target_role or "this role").strip() or "this role"
    summary = (
        f"Mock interview debrief for {role}: average answer score {overall}/100 "
        f"across {len(turns)} response(s). "
        f"Communication score {communication}/100 based on filler density "
        f"({total_fillers} fillers in ~{word_total or 0} words)."
        + (f" Average speaking pace ~{avg_wpm} wpm." if avg_wpm is not None else "")
    )
    question_reviews = [
        {
            "question_id": turn.get("question_id"),
            "position": turn.get("position"),
            "question": turn.get("question"),
            "answer": turn.get("answer"),
            "verdict": (turn.get("evaluation") or {}).get("verdict"),
            "score": (turn.get("evaluation") or {}).get("score"),
            "interviewer_feedback": (turn.get("evaluation") or {}).get("interviewer_feedback"),
            "strengths": (turn.get("evaluation") or {}).get("strengths") or [],
            "improvements": (turn.get("evaluation") or {}).get("improvements") or [],
            "better_approach": (turn.get("evaluation") or {}).get("better_approach"),
            "filler_analysis": (turn.get("evaluation") or {}).get("filler_analysis") or {},
            "speaking_delivery": (turn.get("evaluation") or {}).get("speaking_delivery") or {},
            "gaze_metrics": normalize_gaze_metrics(
                (turn.get("evaluation") or {}).get("gaze_metrics") or turn.get("gaze_metrics")
            ),
        }
        for turn in turns
    ]
    readiness = practice_readiness_recommendation(
        overall_score=overall,
        communication_score=communication,
        structure_score=structure,
        content_score=content,
        filler_rate=rate,
        eye_contact_score=avg_eye,
    )
    # Per-question scores for charts (UI only uses real measured values).
    score_series = [
        {
            "position": turn.get("position"),
            "score": int((turn.get("evaluation") or {}).get("score") or 0),
            "label": f"Q{turn.get('position') or '?'}",
        }
        for turn in turns
    ]
    lowest = min(
        turns,
        key=lambda turn: int((turn.get("evaluation") or {}).get("score") or 0),
    )
    lowest_position = lowest.get("position") or "the lowest-scoring"
    lowest_improvement = next(
        (str(item).strip() for item in (lowest.get("evaluation") or {}).get("improvements") or [] if str(item).strip()),
        "Add a specific action and measurable result.",
    )
    practice_plan = [
        f"Re-answer question {lowest_position} and address this observed gap: {lowest_improvement}",
    ]
    if total_fillers:
        practice_plan.append(
            f"Record one answer and replace the {total_fillers} observed filler token(s) with short pauses."
        )
    if not wpm_values:
        practice_plan.append("Time the next spoken answer so speaking pace can be measured from the recording.")
    else:
        practice_plan.append("End each answer with the result or learning that was present in your recorded example.")
    return {
        "overall_summary": summary[:3000],
        "overall_score": overall,
        "communication_score": communication,
        "structure_score": structure,
        "content_score": content,
        "strengths": strengths,
        "improvements": improvements,
        "practice_plan": practice_plan[:10],
        "filler_summary": (
            f"{total_fillers} filler tokens across the session"
            + (f" (~{rate:.1%} of words)." if word_total else ".")
        ),
        "speaking_summary": {
            "average_words_per_minute": avg_wpm,
            "total_fillers": total_fillers,
            "total_words": word_total,
            "filler_rate": round(rate, 4),
            "answers_with_pace": len(wpm_values),
        },
        "gaze_summary": gaze_summary,
        "practice_readiness": readiness,
        "score_series": score_series,
        "question_reviews": question_reviews,
        "provider": "deterministic",
        "model": None,
        "agent": "interview_evaluation",
        "report_version": INTERVIEW_REPORT_VERSION,
        "generation_status": "evidence_only",
    }


async def generate_interview_session_report(
    settings: Settings,
    *,
    turns: list[dict[str, Any]],
    target_role: str | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    base = _deterministic_session_report(turns, target_role=target_role)
    if not settings.groq_configured or not turns:
        return base
    try:
        from pathlib import Path

        prompt_path = Path(__file__).resolve().parents[3] / "agents" / "prompts" / "interview_session_report_v1.txt"
        system_prompt = prompt_path.read_text(encoding="utf-8")
        client = GroqClient(settings)
        compact_turns = [
            {
                "position": t.get("position"),
                "question": str(t.get("question") or "")[:500],
                "answer": str(t.get("answer") or "")[:2000],
                "score": (t.get("evaluation") or {}).get("score"),
                "verdict": (t.get("evaluation") or {}).get("verdict"),
                "interviewer_feedback": (t.get("evaluation") or {}).get("interviewer_feedback"),
                "strengths": (t.get("evaluation") or {}).get("strengths"),
                "improvements": (t.get("evaluation") or {}).get("improvements"),
                "words_per_minute": ((t.get("evaluation") or {}).get("speaking_delivery") or {}).get("words_per_minute"),
                "eye_contact_score": ((t.get("evaluation") or {}).get("gaze_metrics") or {}).get("eye_contact_score"),
                "fillers": ((t.get("evaluation") or {}).get("filler_analysis") or {}).get("total_count"),
                "unattempted": bool(t.get("unattempted")),
            }
            for t in turns
        ]
        result: SessionReportResult = await client.generate_structured(
            system_prompt=system_prompt,
            user_payload={
                "target_role": target_role,
                "mode": mode,
                "turns": compact_turns,
                "deterministic_scores": {
                    "overall_score": base["overall_score"],
                    "communication_score": base["communication_score"],
                },
            },
            schema_model=SessionReportResult,
        )
        overall = int(result.overall_score)
        communication = int(result.communication_score)
        structure = int(result.structure_score)
        content = int(result.content_score)
        speaking = base.get("speaking_summary") or {}
        gaze_summary = base.get("gaze_summary") or {}
        filler_rate = float(speaking.get("filler_rate") or 0.0)
        eye = gaze_summary.get("average_eye_contact_score")
        readiness = practice_readiness_recommendation(
            overall_score=overall,
            communication_score=communication,
            structure_score=structure,
            content_score=content,
            filler_rate=filler_rate,
            eye_contact_score=int(eye) if eye is not None else None,
        )
        strengths = list(result.strengths) if result.strengths is not None else list(base["strengths"])
        improvements = list(result.improvements) if result.improvements is not None else list(base["improvements"])
        plan = list(result.practice_plan) if result.practice_plan is not None else list(base["practice_plan"])
        summary = (result.overall_summary or base["overall_summary"]).strip()[:3000]
        filler_sum = (result.filler_summary or base["filler_summary"]).strip()[:1000]
        return {
            "overall_summary": summary,
            "overall_score": overall,
            "communication_score": communication,
            "structure_score": structure,
            "content_score": content,
            "strengths": strengths[:10],
            "improvements": improvements[:10],
            "practice_plan": plan[:10],
            "filler_summary": filler_sum,
            "speaking_summary": speaking,
            "gaze_summary": gaze_summary,
            "practice_readiness": readiness,
            "score_series": base.get("score_series") or [],
            "question_reviews": base["question_reviews"],
            "provider": "groq",
            "model": settings.groq_model,
            "agent": "interview_evaluation",
            "report_version": INTERVIEW_REPORT_VERSION,
            "generation_status": "ai_generated",
        }
    except Exception as exc:
        logger.warning("interview_session_report_failed reason=%s", type(exc).__name__)
        return {
            **base,
            "fallback": True,
            "fallback_reason": type(exc).__name__,
            "generation_status": "evidence_only_ai_unavailable",
        }
