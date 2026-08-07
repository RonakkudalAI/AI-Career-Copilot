
from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.providers.groq_client import GroqClient
from app.core.config import Settings

logger = logging.getLogger(__name__)

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


def _score_answer_heuristic(answer: str, question: str) -> dict[str, Any]:
    text = (answer or "").strip()
    q = (question or "").strip().lower()
    words = re.findall(r"[A-Za-z']+", text.lower())
    word_count = len(words)
    fillers = analyze_filler_words(text)
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
) -> dict[str, Any]:
    """Evaluate one answer: deterministic base + optional Groq interviewer voice."""
    base = _score_answer_heuristic(answer, question)
    fillers = base["filler_analysis"]
    if not (answer or "").strip():
        return {
            **base,
            "verdict": "weak",
            "score": 0,
            "interviewer_feedback": "No answer was captured. Share a specific example next time.",
            "strengths": [],
            "improvements": ["Provide a spoken or typed answer before saving."],
        }

    if not settings.groq_configured:
        return base

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
            },
            schema_model=AnswerEvaluationResult,
        )
        return {
            "verdict": (result.verdict or base["verdict"])[:40],
            "score": int(result.score),
            "interviewer_feedback": (result.interviewer_feedback or base["interviewer_feedback"])[:2000],
            "strengths": list(result.strengths or base["strengths"])[:8],
            "improvements": list(result.improvements or base["improvements"])[:8],
            "better_approach": (result.better_approach or base["better_approach"])[:2000],
            "filler_notes": (result.filler_notes or base["filler_notes"])[:600],
            "filler_analysis": fillers,
            "provider": "groq",
            "model": settings.groq_model,
            "agent": "interview_evaluation",
        }
    except Exception as exc:
        logger.warning("interview_answer_eval_failed reason=%s", type(exc).__name__)
        return {**base, "fallback": True, "fallback_reason": type(exc).__name__}


def _deterministic_session_report(
    turns: list[dict[str, Any]],
    *,
    target_role: str | None,
) -> dict[str, Any]:
    if not turns:
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
        }
        for turn in turns
    ]
    return {
        "overall_summary": summary[:3000],
        "overall_score": overall,
        "communication_score": communication,
        "structure_score": structure,
        "content_score": content,
        "strengths": strengths,
        "improvements": improvements,
        "practice_plan": [
            "Re-answer your lowest-scoring question with a STAR outline written first.",
            "Record one answer and listen for fillers; replace them with a 1-second pause.",
            "End every answer with a measurable result or clear learning.",
        ],
        "filler_summary": (
            f"{total_fillers} filler tokens across the session"
            + (f" (~{rate:.1%} of words)." if word_total else ".")
        ),
        "question_reviews": question_reviews,
        "provider": "deterministic",
        "model": None,
        "agent": "interview_evaluation",
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
                "answer": str(t.get("answer") or "")[:1200],
                "score": (t.get("evaluation") or {}).get("score"),
                "verdict": (t.get("evaluation") or {}).get("verdict"),
                "fillers": ((t.get("evaluation") or {}).get("filler_analysis") or {}).get("total_count"),
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
        return {
            "overall_summary": (result.overall_summary or base["overall_summary"])[:3000],
            "overall_score": int(result.overall_score),
            "communication_score": int(result.communication_score),
            "structure_score": int(result.structure_score),
            "content_score": int(result.content_score),
            "strengths": list(result.strengths or base["strengths"])[:10],
            "improvements": list(result.improvements or base["improvements"])[:10],
            "practice_plan": list(result.practice_plan or base["practice_plan"])[:10],
            "filler_summary": (result.filler_summary or base["filler_summary"])[:1000],
            "question_reviews": base["question_reviews"],
            "provider": "groq",
            "model": settings.groq_model,
            "agent": "interview_evaluation",
        }
    except Exception as exc:
        logger.warning("interview_session_report_failed reason=%s", type(exc).__name__)
        return {**base, "fallback": True, "fallback_reason": type(exc).__name__}
