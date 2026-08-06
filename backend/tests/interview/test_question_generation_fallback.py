import asyncio
from types import SimpleNamespace

from app.core.errors import ApiError
from app.features.interview.agent import question_generator


def test_interview_questions_remain_available_when_groq_is_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise ApiError(503, "groq_unavailable", "Groq is temporarily unavailable.")

    monkeypatch.setattr(question_generator.GroqClient, "generate_structured", unavailable)

    result = asyncio.run(
        question_generator.generate_interview_questions(
            SimpleNamespace(
                groq_configured=True,
                groq_model="test-model",
            ),
            mode="technical",
            count=3,
            target_role="Backend Engineer",
        )
    )

    assert len(result["questions"]) == 3
    assert result["provider"] == "template"
    assert result["fallback"] is True
    assert result["fallback_reason"] == "groq_unavailable"


def test_interview_questions_fallback_on_unexpected_provider_errors(monkeypatch):
    """Non-ApiError provider crashes must not block session start (500)."""

    async def boom(*_args, **_kwargs):
        raise RuntimeError("unexpected provider crash")

    monkeypatch.setattr(question_generator.GroqClient, "generate_structured", boom)

    result = asyncio.run(
        question_generator.generate_interview_questions(
            SimpleNamespace(groq_configured=True, groq_model="test-model"),
            mode="technical",
            count=2,
            target_role="Backend Engineer",
        )
    )

    assert len(result["questions"]) == 2
    assert result["provider"] == "template"
    assert result["fallback"] is True
    assert result["fallback_reason"] == "RuntimeError"
