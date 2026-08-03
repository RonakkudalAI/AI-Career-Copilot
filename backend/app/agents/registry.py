"""
Central registry of Career Copilot agents.

This is the single source of truth for:
  - which product agents exist
  - which LLM provider each uses
  - whether they are configured at runtime
"""

from __future__ import annotations

from typing import Any

from app.features.resume_improvement.agents.crew import crew_capability, crew_runtime_mode
from app.agents.providers import GroqClient, NvidiaClient
from app.core.config import Settings


# Product agent ids — keep stable for API/UI consumers.
AGENT_RESUME_IMPROVEMENT = "resume_improvement"
AGENT_PROFILE_FILL = "profile_fill"
AGENT_INTERVIEW_QUESTIONS = "interview_questions"
AGENT_ATS_IMPROVEMENT_BRIEF = "ats_improvement_brief"
AGENT_RESUME_IMPROVEMENT_CREW = "resume_improvement_crew"


def list_agents(settings: Settings) -> list[dict[str, Any]]:
    nvidia = NvidiaClient(settings).capability()
    groq = GroqClient(settings).capability()
    crew = crew_capability(settings)

    return [
        {
            "id": AGENT_RESUME_IMPROVEMENT,
            "name": "Resume improvement",
            "description": "Evidence-checked resume rewrite suggestions for confirmed sections.",
            "provider": "nvidia",
            "prompt": "improve_resume_v1.txt",
            "configured": bool(nvidia.get("configured")),
            "ready": bool(nvidia.get("configured")),
            "model": nvidia.get("model"),
            "endpoint": "POST /api/v1/resume-improvements",
            "fallback": "Manual edit and export remain available when NVIDIA is not configured.",
            "orchestration": crew_runtime_mode(),
        },
        {
            "id": AGENT_RESUME_IMPROVEMENT_CREW,
            "name": crew["name"],
            "description": (
                "CrewAI-compatible sequential crew: ATS gap analyst → NVIDIA improver → "
                "evidence validator. Tools never invent experience."
            ),
            "provider": "nvidia",
            "prompt": "improve_resume_v1.txt (+ crew tools)",
            "configured": bool(nvidia.get("configured")),
            "ready": bool(crew.get("ready")),
            "model": nvidia.get("model"),
            "endpoint": "POST /api/v1/resume-improvements",
            "fallback": crew.get("official_crewai_note") or crew.get("truthfulness"),
            "framework": crew.get("framework"),
            "runtime": crew.get("runtime"),
            "crew_agents": crew.get("agents"),
            "crew_tasks": crew.get("tasks"),
            "official_crewai_package": crew.get("official_crewai_package"),
        },
        {
            "id": AGENT_PROFILE_FILL,
            "name": "Profile fill from resume",
            "description": "Extract profile fields from resume text (AI + deterministic merge).",
            "provider": "nvidia",
            "prompt": "fill_profile_from_resume_v1.txt",
            "configured": bool(nvidia.get("configured")),
            "ready": True,  # deterministic path always works
            "model": nvidia.get("model") if nvidia.get("configured") else None,
            "endpoint": "POST /api/v1/profile/from-resume/preview",
            "fallback": "Deterministic resume mapping when NVIDIA is unavailable.",
        },
        {
            "id": AGENT_INTERVIEW_QUESTIONS,
            "name": "Interview question generation",
            "description": "Generate mock-interview questions for a session.",
            "provider": "groq",
            "prompt": "interview_questions_v1.txt",
            "configured": bool(groq.get("configured")),
            "ready": True,  # template fallback always works
            "model": groq.get("model") if groq.get("configured") else None,
            "endpoint": "POST /api/v1/interviews/{session_id}/start",
            "fallback": "Local templates when Groq is unavailable (NVIDIA is never used here).",
        },
        {
            "id": AGENT_ATS_IMPROVEMENT_BRIEF,
            "name": "ATS improvement brief",
            "description": "Overall inference from missing ATS keywords only (no invented experience).",
            "provider": "nvidia_or_groq",
            "prompt": "ats_improvement_v1.txt",
            "configured": bool(nvidia.get("configured") or groq.get("configured")),
            "ready": True,  # deterministic brief always works
            "model": nvidia.get("model")
            if nvidia.get("configured")
            else (groq.get("model") if groq.get("configured") else None),
            "endpoint": "POST /api/v1/ats-analyses (summary.overall_inference)",
            "fallback": "Deterministic missing-keyword brief when no LLM is available.",
        },
    ]


def agents_status(settings: Settings) -> dict[str, Any]:
    agents = list_agents(settings)
    nvidia = NvidiaClient(settings).capability()
    groq = GroqClient(settings).capability()
    ready_count = sum(1 for a in agents if a.get("ready"))
    configured_llm_agents = sum(1 for a in agents if a.get("configured"))
    return {
        "status": "ok",
        "agent_count": len(agents),
        "ready_count": ready_count,
        "llm_configured_agent_count": configured_llm_agents,
        "providers": {
            "nvidia": {
                "configured": bool(nvidia.get("configured")),
                "model": nvidia.get("model"),
                "base_url": nvidia.get("base_url"),
            },
            "groq": {
                "configured": bool(groq.get("configured")),
                "model": groq.get("model"),
                "base_url": groq.get("base_url"),
            },
        },
        "agents": agents,
    }
