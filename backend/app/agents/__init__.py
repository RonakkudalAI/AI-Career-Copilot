"""
AI agents package for Career Copilot.

Layout:
  agents/
    providers/        NVIDIA + Groq provider clients (separate; no cross-fallback)
    prompts/          System prompts (versioned text files)
    feature-owned agent packages live under app.features.*
    registry.py       Status registry for all product agents

Public entry points:
from app.agents.providers import NvidiaClient, GroqClient
  from app.features.profile.agent import build_profile_draft_enriched
  from app.features.mock_interview.agent.interview import generate_interview_questions
  from app.agents.registry import agents_status
  from app.features.resume_improvement.agents.crew import run_resume_improvement_crew, crew_capability
"""

from importlib import import_module
from typing import Any


# Keep the package namespace backwards-compatible without importing feature
# packages while one of them is still being initialized. Importing a nested
# module such as ``app.agents.providers.groq_client`` always initializes this
# package first, so eager feature imports here create a circular dependency.
_LAZY_EXPORTS: dict[str, tuple[str, str]] = {
    "GroqClient": ("app.agents.providers", "GroqClient"),
    "NvidiaClient": ("app.agents.providers", "NvidiaClient"),
    "agents_status": ("app.agents.registry", "agents_status"),
    "build_profile_draft": ("app.features.profile.agent", "build_profile_draft"),
    "build_profile_draft_enriched": (
        "app.features.profile.agent",
        "build_profile_draft_enriched",
    ),
    "crew_capability": (
        "app.features.resume_improvement.agents.crew",
        "crew_capability",
    ),
    "crew_runtime_mode": (
        "app.features.resume_improvement.agents.crew",
        "crew_runtime_mode",
    ),
    "draft_counts": ("app.features.profile.agent", "draft_counts"),
    "generate_ats_improvement_brief": (
        "app.features.ats.agents",
        "generate_ats_improvement_brief",
    ),
    "generate_interview_questions": (
        "app.features.mock_interview.agent",
        "generate_interview_questions",
    ),
    "list_agents": ("app.agents.registry", "list_agents"),
    "profile_draft_response_payload": (
        "app.features.profile.agent",
        "profile_draft_response_payload",
    ),
    "run_resume_improvement_crew": (
        "app.features.resume_improvement.agents.crew",
        "run_resume_improvement_crew",
    ),
}


def __getattr__(name: str) -> Any:
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module_name, attribute_name = target
    value = getattr(import_module(module_name), attribute_name)
    globals()[name] = value
    return value

__all__ = [
    "GroqClient",
    "NvidiaClient",
    "agents_status",
    "build_profile_draft",
    "build_profile_draft_enriched",
    "crew_capability",
    "crew_runtime_mode",
    "draft_counts",
    "generate_ats_improvement_brief",
    "generate_interview_questions",
    "list_agents",
    "profile_draft_response_payload",
    "run_resume_improvement_crew",
]
