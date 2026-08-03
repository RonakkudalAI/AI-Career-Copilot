from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.features.ats.agent.prompts import (
    DOMAIN_GATE_PROMPT,
    JD_PARSE_PROMPT,
    RESUME_PARSE_PROMPT,
    SCORING_PROMPT,
)
from app.features.ats.scoring.schemas import JDParsed, GateResult, ResumeParsed, ScoreResult


def _configure_crewai_storage() -> None:
    """Keep CrewAI's implicit Chroma/RAG storage inside the project data dir."""
    from app.core.config import get_settings

    # ATS scoring must not send CrewAI traces to a third-party telemetry
    # service unless the project explicitly opts in.
    os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")

    storage_dir = Path(get_settings().crewai_storage_dir).expanduser().resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    (storage_dir / "credentials").mkdir(parents=True, exist_ok=True)

    # CrewAI imports Chroma constants while importing ``crewai``. Patch its
    # storage boundary before that import so Windows shell-folder permissions
    # cannot prevent the ATS pipeline from initializing.
    import crewai_core.paths as crewai_paths

    crewai_paths.db_storage_path = lambda: str(storage_dir)

    # Recent CrewAI releases also create an encrypted telemetry credential
    # directory independently of db_storage_path. Keep that directory local
    # as well; otherwise import can still fail before any ATS task is created.
    from crewai_core.token_manager import TokenManager

    TokenManager._get_secure_storage_path = staticmethod(lambda: storage_dir / "credentials")


def _crewai():
    try:
        _configure_crewai_storage()
        from crewai import Agent, Task
    except Exception as exc:
        raise RuntimeError("CrewAI could not be initialized for the ATS scoring pipeline") from exc
    return Agent, Task


def build_agents(llm: Any) -> dict[str, Any]:
    Agent, _ = _crewai()
    return {
        "resume_parser": Agent(
            role="Resume Parsing Agent",
            goal="Extract only explicit resume facts into the ResumeParsed schema.",
            backstory="You are a conservative resume parser. You never invent candidate facts.",
            llm=llm,
            verbose=False,
        ),
        "jd_parser": Agent(
            role="Job Description Parsing Agent",
            goal="Extract the domain, role family, requirements, and criteria from a JD.",
            backstory="You separate mandatory requirements from preferences and abstain when text is unclear.",
            llm=llm,
            verbose=False,
        ),
        "domain_gate": Agent(
            role="Domain Gate Agent",
            goal="Reject clearly out-of-domain candidates before scoring.",
            backstory="You are a strict pre-scoring gate and explain decisions from structured evidence only.",
            llm=llm,
            verbose=False,
        ),
        "scorer": Agent(
            role="Resume Scoring Agent",
            goal="Score an allowed candidate against a parsed job description using the required formula.",
            backstory="You score only structured inputs and never add unsupported candidate claims.",
            llm=llm,
            verbose=False,
        ),
    }


def build_resume_parse_task(agent: Any, resume_text: str) -> Any:
    _, Task = _crewai()
    return Task(
        description=f"{RESUME_PARSE_PROMPT}\n\nResume text:\n{resume_text}",
        expected_output="A valid ResumeParsed JSON object.",
        agent=agent,
        output_pydantic=ResumeParsed,
    )


def build_jd_parse_task(agent: Any, jd_text: str) -> Any:
    _, Task = _crewai()
    return Task(
        description=f"{JD_PARSE_PROMPT}\n\nJob description text:\n{jd_text}",
        expected_output="A valid JDParsed JSON object.",
        agent=agent,
        output_pydantic=JDParsed,
    )


def build_domain_gate_task(agent: Any, resume: ResumeParsed, jd: JDParsed) -> Any:
    _, Task = _crewai()
    return Task(
        description=(
            f"{DOMAIN_GATE_PROMPT}\n\nResumeParsed:\n{resume.model_dump_json()}\n\n"
            f"JDParsed:\n{jd.model_dump_json()}"
        ),
        expected_output="A valid GateResult JSON object.",
        agent=agent,
        output_pydantic=GateResult,
    )


def build_scoring_task(agent: Any, resume: ResumeParsed, jd: JDParsed, gate: GateResult) -> Any:
    _, Task = _crewai()
    return Task(
        description=(
            f"{SCORING_PROMPT}\n\nResumeParsed:\n{resume.model_dump_json()}\n\n"
            f"JDParsed:\n{jd.model_dump_json()}\n\nGateResult:\n{gate.model_dump_json()}"
        ),
        expected_output="A valid ScoreResult JSON object.",
        agent=agent,
        output_pydantic=ScoreResult,
    )
