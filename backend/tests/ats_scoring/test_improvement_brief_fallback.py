"""ATS improvement brief must never fail the scoring path when AI is down.

POST /ats-analyses treats the brief as optional enrichment; if NVIDIA times out
or returns nvidia_unavailable, callers must still get a deterministic brief
instead of a 500 "could not be persisted".
"""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from app.core.errors import ApiError
from app.features.ats.agents import improvement_brief as ib


def _settings(**overrides):
    base = dict(
        llm_provider="groq",
        nvidia_configured=True,
        groq_configured=False,
        nvidia_temperature=0.2,
        nvidia_model="test-nvidia",
        nvidia_timeout_seconds=90.0,
        groq_temperature=0.4,
        groq_model="test-groq",
        groq_timeout_seconds=45.0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


async def _call_brief(settings):
    return await ib.generate_ats_improvement_brief(
        settings,
        overall_score=50.0,
        missing_terms=["Python"],
        matched_count=1,
        total_terms=2,
        role_title="Backend Engineer",
        missing_items=[
            {"term": "Python", "priority": "critical", "suggested_section": "skills"}
        ],
    )


def test_ats_brief_falls_back_when_nvidia_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise ApiError(503, "nvidia_unavailable", "provider unavailable")

    monkeypatch.setattr(ib.NvidiaClient, "generate_structured", unavailable)

    result = asyncio.run(_call_brief(_settings()))

    assert result["fallback"] is True
    assert result["provider"] == "deterministic"
    assert "Python" in result["overall_inference"]
    assert result["focus_areas"]


def test_ats_brief_falls_back_to_groq_when_nvidia_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise ApiError(503, "nvidia_unavailable", "provider unavailable")

    class GroqResult:
        overall_inference = (
            "Keyword coverage is incomplete for Python. Review missing skills carefully."
        )
        focus_areas = ["Python"]
        priority_actions = ["Add Python under skills if true."]
        section_guidance = ["Python: skills (critical)."]
        do_not_claim = ["Do not invent experience."]

    async def groq_ok(*_args, **_kwargs):
        return GroqResult()

    monkeypatch.setattr(ib.NvidiaClient, "generate_structured", unavailable)
    monkeypatch.setattr(ib.GroqClient, "generate_structured", groq_ok)

    # Prefer NVIDIA so Groq is only the fallback (not primary).
    result = asyncio.run(
        _call_brief(_settings(llm_provider="nvidia", groq_configured=True))
    )

    assert result["fallback"] is False
    assert result["provider"] == "groq"
    assert "Python" in result["overall_inference"] or result["focus_areas"]


def test_ats_brief_prefers_groq_when_llm_provider_is_groq(monkeypatch):
    """LLM_PROVIDER=groq must call Groq first even when NVIDIA is configured."""
    order: list[str] = []

    class GroqResult:
        overall_inference = (
            "Keyword coverage is incomplete for Python. Review missing skills carefully."
        )
        focus_areas = ["Python"]
        priority_actions = ["Add Python under skills if true."]
        section_guidance = ["Python: skills (critical)."]
        do_not_claim = ["Do not invent experience."]

    async def nvidia(*_args, **_kwargs):
        order.append("nvidia")
        raise AssertionError("NVIDIA must not be primary when LLM_PROVIDER=groq")

    async def groq(*_args, **_kwargs):
        order.append("groq")
        return GroqResult()

    monkeypatch.setattr(ib.NvidiaClient, "generate_structured", nvidia)
    monkeypatch.setattr(ib.GroqClient, "generate_structured", groq)

    result = asyncio.run(
        _call_brief(_settings(llm_provider="groq", groq_configured=True, nvidia_configured=True))
    )

    assert order == ["groq"]
    assert result["provider"] == "groq"
    assert result["fallback"] is False


def test_ats_brief_does_not_wait_for_slow_nvidia(monkeypatch):
    async def slow(*_args, **_kwargs):
        await asyncio.sleep(30)

    monkeypatch.setattr(ib.NvidiaClient, "generate_structured", slow)

    # Production caps optional brief AI at 12s even when provider timeout is 90s.
    # Use a tiny configured timeout so this regression stays fast in CI.
    started = time.perf_counter()
    result = asyncio.run(_call_brief(_settings(nvidia_timeout_seconds=0.05)))
    elapsed = time.perf_counter() - started

    assert elapsed < 2.0, f"optional brief blocked for {elapsed:.1f}s"
    assert result["fallback"] is True
    assert result["provider"] == "deterministic"


def test_ats_brief_caps_long_provider_timeout(monkeypatch):
    """Even with a 90s provider timeout, optional brief must not hang that long."""
    async def slow(*_args, **_kwargs):
        await asyncio.sleep(60)

    monkeypatch.setattr(ib.NvidiaClient, "generate_structured", slow)
    # Shrink the production cap for a fast unit test of the min() clamp.
    monkeypatch.setattr(ib, "_OPTIONAL_BRIEF_TIMEOUT_SECONDS", 0.2)

    started = time.perf_counter()
    result = asyncio.run(_call_brief(_settings(nvidia_timeout_seconds=90.0)))
    elapsed = time.perf_counter() - started

    assert elapsed < 2.0, f"optional brief blocked for {elapsed:.1f}s (cap should clamp provider timeout)"
    assert result["fallback"] is True
    assert result["provider"] == "deterministic"
