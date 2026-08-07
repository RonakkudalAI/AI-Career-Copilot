
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.providers.groq_client import GroqClient
from app.core.config import Settings
from app.core.errors import ApiError

logger = logging.getLogger(__name__)
_PROMPT_PATH = Path(__file__).resolve().parents[3] / "agents" / "prompts" / "interview_questions_v1.txt"
class InterviewQuestionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    question: str = Field(min_length=8, max_length=800)
    question_type: str | None = Field(default=None, max_length=80)
class InterviewQuestionsResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    questions: list[InterviewQuestionItem] = Field(min_length=1, max_length=20)
def _template_questions(
    mode: str,
    count: int,
    target_role: str | None,
    *,
    job_description_text: str | None = None,
) -> list[dict[str, str]]:
    role = (target_role or "this role").strip() or "this role"
    jd_present = bool((job_description_text or "").strip())
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
        "role": [
            (f"What makes you a strong fit for {role}?", "hr"),
            (f"Describe a project that prepared you for {role}.", "behavioural"),
            (f"What would your first 90 days look like as a {role}?", "situational"),
            ("Tell me about a technical challenge you owned end-to-end.", "technical"),
            ("How do you collaborate with product and design?", "behavioural"),
        ],
        "resume_and_jd": [
            (f"Walk me through how your experience maps to {role}.", "hr"),
            ("Which requirement in this role do you meet most strongly? Give evidence.", "behavioural"),
            ("Where would you need the most ramp-up, and how would you close the gap?", "situational"),
            ("Describe a project that is closest to the work this job requires.", "technical"),
            ("How would you measure success in the first six months?", "situational"),
        ],
    }
    if jd_present and mode not in bank:
        pool = bank["resume_and_jd"]
    else:
        pool = bank.get(mode, bank["mixed"])
    if jd_present:
        # Surface one JD-grounded prompt without inventing JD contents.
        pool = [
            (
                "Based on the job description you provided, which requirement do you meet "
                "most strongly? Support it with one concrete example from your experience.",
                "behavioural",
            ),
            *pool,
        ]
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
    job_description_text: str | None = None,
    resume_text: str | None = None,
    candidate_skills: list[str] | None = None,
) -> dict[str, Any]:
    count = max(1, min(int(count or 3), 20))
    mode = (mode or "mixed").strip().lower()
    jd_text = (job_description_text or "").strip()[:12_000] or None
    res_text = (resume_text or "").strip()[:8_000] or None
    skills = [s.strip() for s in (candidate_skills or []) if str(s).strip()][:20] or None
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
                    # Only user-pasted JD text — never invent requirements.
                    "job_description_text": jd_text,
                    "resume_summary": res_text,
                    "candidate_skills": skills,
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
            raise ApiError(
                502,
                "groq_returned_no_questions",
                "The interview question provider returned no usable questions. Retry the session start.",
            )
        except Exception as exc:
            # Session start must not hard-fail when Groq is down or returns junk.
            # Templates keep the practice flow available (same idea as ATS brief).
            reason = exc.code if isinstance(exc, ApiError) else type(exc).__name__
            logger.warning("groq_interview_questions_failed reason=%s", reason)
            return {
                "questions": _template_questions(
                    mode, count, target_role, job_description_text=jd_text
                ),
                "provider": "template",
                "model": None,
                "agent": "interview_questions",
                "fallback": True,
                "fallback_reason": str(reason),
            }
    # Groq not configured: templates are the explicit non-AI path, not a silent fallback.
    return {
        "questions": _template_questions(
            mode, count, target_role, job_description_text=jd_text
        ),
        "provider": "template",
        "model": None,
        "agent": "interview_questions",
        "fallback": False,
        "fallback_reason": "groq_not_configured",
    }
