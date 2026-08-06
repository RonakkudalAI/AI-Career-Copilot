from __future__ import annotations

import asyncio
import time

from app.agents.providers.rate_limit import (
    AsyncRpmLimiter,
    parse_retry_after_seconds,
)


def test_rpm_limiter_spaces_calls():
    limiter = AsyncRpmLimiter(rpm=120, name="test")
    async def run() -> float:
        t0 = time.monotonic()
        await limiter.acquire()
        await limiter.acquire()
        return time.monotonic() - t0
    elapsed = asyncio.run(run())
    assert elapsed >= 0.45
    snap = limiter.snapshot()
    assert snap["acquired"] == 2
    assert snap["rpm"] == 120
def test_parse_retry_after_seconds():
    assert parse_retry_after_seconds("5") == 5.0
    assert parse_retry_after_seconds(None, default=2.0) == 2.0
    assert parse_retry_after_seconds("not-a-number", default=3.0) == 3.0
    assert parse_retry_after_seconds("999") == 60.0
def test_rpm_configure_updates_interval():
    limiter = AsyncRpmLimiter(rpm=40, name="cfg")
    assert abs(limiter.min_interval - 1.5) < 0.01
    limiter.configure(60)
    assert abs(limiter.min_interval - 1.0) < 0.01
def test_load_compact_prompts():
    from app.agents.providers.prompts import load_prompt
    for name in (
        "ats_improvement_v1.txt",
        "document_section_extract_v1.txt",
        "fill_profile_from_resume_v1.txt",
        "improve_resume_v1.txt",
        "interview_preparation_v1.txt",
        "interview_questions_v1.txt",
        "learning_youtube_path_v1.txt",
        "repair_structured_output_v1.txt",
    ):
        text = load_prompt(name)
        assert isinstance(text, str)
        assert len(text) > 20
