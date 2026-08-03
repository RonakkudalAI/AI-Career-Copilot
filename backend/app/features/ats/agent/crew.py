from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from app.features.ats.agent.agents import (
    _configure_crewai_storage,
    build_agents,
    build_domain_gate_task,
    build_jd_parse_task,
    build_resume_parse_task,
    build_scoring_task,
)
from app.features.ats.agent.config import get_llm
from app.features.ats.scoring.schemas import JDParsed, GateResult, PARAMETER_KEYS, ResumeParsed, ScoreResult

logger = logging.getLogger(__name__)


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", value.casefold()) if len(token) > 2}


def _domain_family(domain: str) -> str:
    tokens = _tokens(domain)
    if tokens & {"it", "software", "technology", "tech", "engineering", "data", "cloud"}:
        return "technology"
    if tokens & {"banking", "finance", "financial", "fintech", "insurance"}:
        return "finance"
    if tokens & {"healthcare", "health", "medical", "pharma"}:
        return "healthcare"
    if tokens & {"manufacturing", "industrial", "automotive"}:
        return "manufacturing"
    return "other"


def evaluate_domain_gate(resume: ResumeParsed, jd: JDParsed) -> GateResult:
    """Apply the explicit domain-gate rules to structured model output."""
    resume_skills = {_value for skill in resume.skills for _value in _tokens(skill)}
    required = {_value for skill in jd.required_skills for _value in _tokens(skill)}
    overlap = len(resume_skills & required) / len(required) if required else 0
    domain_mismatch = _domain_family(resume.experience[0].industry_tags[0] if resume.experience and resume.experience[0].industry_tags else "") != _domain_family(jd.domain)
    if domain_mismatch and overlap < 0.15:
        return GateResult(
            decision="REJECT",
            reason=f"Domain mismatch with required-skill overlap of {overlap:.2f}, below the 0.15 threshold.",
        )

    role_tokens = _tokens(jd.role_family)
    for entry in resume.experience:
        evidence = _tokens(entry.role) | {token for tag in entry.industry_tags for token in _tokens(tag)}
        if role_tokens & evidence and not domain_mismatch:
            return GateResult(decision="ALLOW", reason="A structured experience entry matches the role family and domain.")
    return GateResult(decision="REJECT", reason="No structured experience entry matches the role family and industry.")


def _crewai_crew(agents: list[Any], tasks: list[Any]) -> Any:
    try:
        from crewai import Crew, Process
    except Exception as exc:
        raise RuntimeError("CrewAI could not be initialized for the ATS scoring pipeline") from exc
    return Crew(agents=agents, tasks=tasks, process=Process.sequential, verbose=False, memory=False)


def _pydantic_output(result: Any, model: type) -> Any:
    output = getattr(result, "pydantic", None)
    if output is not None:
        return model.model_validate(output)
    raw = getattr(result, "raw", result)
    return model.model_validate_json(raw) if isinstance(raw, str) else model.model_validate(raw)


def _rejected_result(gate: GateResult) -> ScoreResult:
    reason = "Not scored because the domain gate rejected the candidate."
    return ScoreResult(
        gate=gate,
        parameter_scores={key: 0 for key in PARAMETER_KEYS},
        composite_score=0,
        reasons={key: reason for key in PARAMETER_KEYS},
    )


def _composite(scores: dict[str, float]) -> float:
    return round(
        0.4 * scores["hard_skill_match"]
        + 0.25 * scores["experience_relevance"]
        + 0.15 * scores["education_match"]
        + 0.10 * scores["certifications_match"]
        + 0.10 * scores["seniority_alignment"],
        2,
    )


def _run_sync(resume_text: str, jd_text: str, provider: str | None = None) -> ScoreResult:
    _configure_crewai_storage()
    llm = get_llm(provider)
    agents = build_agents(llm)
    parse_tasks = [
        build_resume_parse_task(agents["resume_parser"], resume_text),
        build_jd_parse_task(agents["jd_parser"], jd_text),
    ]
    parse_crew = _crewai_crew(
        [agents["resume_parser"], agents["jd_parser"]],
        parse_tasks,
    )
    parse_result = parse_crew.kickoff()
    parsed_outputs = getattr(parse_result, "tasks_output", [])
    if len(parsed_outputs) < 2:
        raise RuntimeError("The parsing crew did not return both structured outputs")
    resume = _pydantic_output(parsed_outputs[0], ResumeParsed)
    jd = _pydantic_output(parsed_outputs[1], JDParsed)
    logger.info("ats_scoring_parse_complete skills=%d experiences=%d required_skills=%d", len(resume.skills), len(resume.experience), len(jd.required_skills))

    gate_task = build_domain_gate_task(agents["domain_gate"], resume, jd)
    gate_crew = _crewai_crew([agents["domain_gate"]], [gate_task])
    gate_result = _pydantic_output(gate_crew.kickoff(), GateResult)
    rule_gate = evaluate_domain_gate(resume, jd)
    if rule_gate.decision == "REJECT":
        gate_result = rule_gate
    logger.info("ats_scoring_gate decision=%s", gate_result.decision)
    if gate_result.decision == "REJECT":
        return _rejected_result(gate_result)

    scoring_task = build_scoring_task(agents["scorer"], resume, jd, gate_result)
    scoring_crew = _crewai_crew([agents["scorer"]], [scoring_task])
    score = _pydantic_output(scoring_crew.kickoff(), ScoreResult)
    score = score.model_copy(
        update={
            "gate": gate_result,
            "composite_score": _composite(score.parameter_scores),
        }
    )
    logger.info("ats_scoring_complete composite_score=%.2f", score.composite_score)
    return score


async def run_pipeline(resume_text: str, jd_text: str, provider: str | None = None) -> ScoreResult:
    """Run parsing, domain gating, and structured scoring without database writes."""
    return await asyncio.to_thread(_run_sync, resume_text, jd_text, provider)
