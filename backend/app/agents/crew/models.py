"""Lightweight CrewAI-style models (Agent / Task / result)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CrewAgent:
    """Role definition — mirrors CrewAI Agent concept without free LLM role-play."""

    role: str
    goal: str
    backstory: str
    allow_delegation: bool = False


@dataclass
class CrewTask:
    """A single sequential task with a named tool handler."""

    name: str
    description: str
    agent: CrewAgent
    expected_output: str
    # Tool is invoked by the orchestrator, not by unconstrained LLM planning.
    tool_name: str


@dataclass
class CrewTaskResult:
    name: str
    agent_role: str
    tool_name: str
    status: str  # ok | skipped | failed
    output: Any = None
    error: str | None = None


@dataclass
class CrewRunResult:
    """Final crew run — product payload + audit trail."""

    process: str  # sequential
    runtime: str  # official_crewai | compatible_orchestrator
    tasks: list[CrewTaskResult] = field(default_factory=list)
    # Domain payload (e.g. ProviderSuggestionResult dump)
    payload: dict[str, Any] = field(default_factory=dict)
    success: bool = True
    message: str | None = None
