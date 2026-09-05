from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.providers.reliable import generate_structured_with_failover
from app.api.schemas import JobFitBatch
from app.core.config import Settings

_PROMPT_PATH = Path(__file__).resolve().parents[1] / "agents" / "prompts" / "job_fit_v1.txt"


async def rank_jobs_with_agent(
    settings: Settings,
    *,
    candidate: dict[str, Any],
    jobs: list[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    """Rank a bounded job batch with the configured provider failover."""
    compact_jobs = [
        {
            "job_id": str(job.get("id") or ""),
            "title": str(job.get("title") or "")[:240],
            "company": str(job.get("company") or "")[:160],
            "location": str(job.get("location") or "")[:160],
            "work_mode": job.get("work_mode"),
            "requirements": [str(item)[:120] for item in (job.get("requirements") or [])][:12],
            "description": str(job.get("description") or "")[:1_400],
        }
        for job in jobs[:24]
        if str(job.get("id") or "").strip()
    ]
    compact_candidate = {
        "profile": candidate.get("profile") or {},
        "preferences": candidate.get("preferences") or {},
        "skills": list(candidate.get("skills") or [])[:40],
        "confirmed_evidence": str(candidate.get("confirmed_evidence") or "")[:4_000],
    }
    result, provider = await generate_structured_with_failover(
        settings,
        system_prompt=_PROMPT_PATH.read_text(encoding="utf-8"),
        user_payload={"candidate": compact_candidate, "jobs": compact_jobs},
        schema_model=JobFitBatch,
        temperature=0.1,
        attempts_per_provider=1,
        allow_repair=False,
        timeout_seconds=30.0,
    )
    valid_ids = {row["job_id"] for row in compact_jobs}
    evaluations = [
        item.model_dump()
        for item in JobFitBatch.model_validate(result).evaluations
        if item.job_id in valid_ids
    ]
    return {"evaluations": evaluations}, provider
