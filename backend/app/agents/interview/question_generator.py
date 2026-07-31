"""
Mock interview question generation via Groq.

This is a dedicated Groq task. It does not use NVIDIA and is not a fallback for
resume improvement or profile-fill agents.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.llm.groq_client import GroqClient
from app.core.config import Settings
from app.core.errors import ApiError

logger = logging.getLogger(__name__)
_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "interview_questions_v1.txt"


class InterviewQuestionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    question: str = Field(min_length=8, max_length=800)
    question_type: str | None = Field(default=None, max_length=80)


class InterviewQuestionsResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    questions: list[InterviewQuestionItem] = Field(min_length=1, max_length=20)


def _template_questions(mode: str, count: int, target_role: str | None) -> list[dict[str, str]]:
    """Deterministic templates if Groq is unavailable."""
    role = (target_role or "this role").strip() or "this role"
    bank = {
        "behavioural": [
            ("Tell me about a time you handled a difficult stakeholder.", "behavioural"),
            ("Describe a situation where you had to learn something quickly under pressure.", "behavioural"),
            ("Give an example of how you resolved a conflict within a team.", "behavioural"),
            ("Tell me about a project you are proud of and your contribution.", "behavioural"),
            ("How do you prioritize work when everything feels urgent?", "situational"),
        ],
        "technical": [
            (f"Walk me through how you would design a simple API for {role}.", "technical"),
            ("How do you approach debugging a production issue?", "technical"),
            ("Explain a technical trade-off you made recently and why.", "technical"),
            ("How would you test and monitor a new service after deployment?", "technical"),
            ("Describe how you would optimize a slow database query.", "technical"),
        ],
        "mixed": [
            (f"Why are you interested in {role}?", "hr"),
            ("Tell me about a challenging bug you fixed.", "technical"),
            ("Describe a time you improved a process or system.", "behavioural"),
            ("How do you handle incomplete requirements?", "situational"),
            ("Explain a concept from your stack to a non-technical audience.", "technical"),
        ],
        "hr": [
            (f"Why do you want to work as a {role}?", "hr"),
            ("Where do you see yourself in three years?", "hr"),
            ("What are your strengths and areas for growth?", "hr"),
            ("How do you handle feedback from managers?", "behavioural"),
            ("What motivates you in a team environment?", "hr"),
        ],
    }
    pool = bank.get(mode, bank["mixed"])
    selected = [pool[i % len(pool)] for i in range(max(1, min(count, 20)))]
    return [{"question": q, "question_type": t} for q, t in selected]


async def generate_interview_questions(
    settings: Settings,
    *,
    mode: str,
    count: int,
    target_role: str | None = None,
    target_company: str | None = None,
    difficulty: str | None = None,
    topic: str | None = None,
) -> dict[str, Any]:
    """
    Generate interview questions.
    Primary: Groq structured JSON. Fallback: local templates (not NVIDIA).
    """
    count = max(1, min(int(count or 3), 20))
    mode = (mode or "mixed").strip().lower()

    fallback_reason: str | None = None
    if settings.groq_configured:
        try:
            prompt = _PROMPT_PATH.read_text(encoding="utf-8")
            client = GroqClient(settings)
            result: InterviewQuestionsResult = await client.generate_structured(
                system_prompt=prompt,
                user_payload={
                    "mode": mode,
                    "question_count": count,
                    "target_role": target_role,
                    "target_company": target_company,
                    "difficulty": difficulty,
                    "topic": topic,
                },
                schema_model=InterviewQuestionsResult,
            )
            questions = [
                {
                    "question": item.question.strip(),
                    "question_type": (item.question_type or mode)[:80],
                }
                for item in result.questions[:count]
                if item.question.strip()
            ]
            if questions:
                return {
                    "questions": questions,
                    "provider": "groq",
                    "model": settings.groq_model,
                    "agent": "interview_questions",
                    "fallback": False,
                }
            fallback_reason = "groq_returned_no_questions"
            logger.warning("groq_interview_questions_empty")
        except ApiError as exc:
            fallback_reason = exc.code
            logger.warning("groq_interview_questions_failed code=%s message=%s", exc.code, exc.message)
        except Exception as exc:
            fallback_reason = "groq_unexpected_error"
            logger.warning("groq_interview_questions_failed error=%s", exc)
    else:
        fallback_reason = "groq_not_configured"

    return {
        "questions": _template_questions(mode, count, target_role),
        "provider": "template",
        "model": None,
        "agent": "interview_questions",
        "fallback": True,
        "fallback_reason": fallback_reason,
    }
