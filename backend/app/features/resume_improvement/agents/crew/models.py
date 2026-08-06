
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CrewAgent:
    role: str
    goal: str
    backstory: str
    allow_delegation: bool = False
@dataclass
class CrewTask:
    name: str
    description: str
    agent: CrewAgent
    expected_output: str
    tool_name: str
@dataclass
class CrewTaskResult:
    name: str
    agent_role: str
    tool_name: str
    status: str
    output: Any = None
    error: str | None = None
@dataclass
class CrewRunResult:
    process: str
    runtime: str
    tasks: list[CrewTaskResult] = field(default_factory=list)
    payload: dict[str, Any] = field(default_factory=dict)
    success: bool = True
    message: str | None = None
