"""
AI agents package for Career Copilot.

Layout:
  agents/
    llm/              NVIDIA + Groq provider clients (separate; no cross-fallback)
    prompts/          System prompts (versioned text files)
    profile_fill/     Resume → profile (NVIDIA when configured)
    interview/        Mock interview questions (Groq when configured)
    ats/              ATS missing-keyword improvement brief
    crew/             CrewAI-compatible multi-agent orchestration (truth-bound tools)
    registry.py       Status registry for all product agents

Public entry points:
  from app.agents.llm import NvidiaClient, GroqClient
  from app.agents.profile_fill import build_profile_draft_enriched
  from app.agents.interview import generate_interview_questions
  from app.agents.registry import agents_status
  from app.agents.crew import run_resume_improvement_crew, crew_capability
"""

from app.agents.ats import generate_ats_improvement_brief
from app.agents.crew import crew_capability, crew_runtime_mode, run_resume_improvement_crew
from app.agents.interview import generate_interview_questions
from app.agents.llm import GroqClient, NvidiaClient
from app.agents.profile_fill import (
    build_profile_draft,
    build_profile_draft_enriched,
    draft_counts,
    profile_draft_response_payload,
)
from app.agents.registry import agents_status, list_agents

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
