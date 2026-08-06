
from __future__ import annotations

from typing import Any

from app.agents.providers import GroqClient, NvidiaClient, preferred_llm_provider, preferred_llm_providers
from app.core.config import Settings
from app.features.learning.service import learning_agent_capability
from app.features.resume_improvement.agents.crew import crew_capability, crew_runtime_mode

AGENT_RESUME_IMPROVEMENT = "resume_improvement"
AGENT_PROFILE_FILL = "profile_fill"
AGENT_INTERVIEW_QUESTIONS = "interview_questions"
AGENT_ATS_IMPROVEMENT_BRIEF = "ats_improvement_brief"
AGENT_RESUME_IMPROVEMENT_CREW = "resume_improvement_crew"
AGENT_LEARNING_YOUTUBE_CREW = "learning_youtube_crew"
AGENT_DOCUMENT_SECTION_EXTRACT = "document_section_extract"


def _primary_model(settings: Settings, nvidia: dict[str, Any], groq: dict[str, Any]) -> str | None:
    preferred = preferred_llm_provider(settings)
    if preferred == "groq" and groq.get("configured"):
        return groq.get("model")
    if preferred == "nvidia" and nvidia.get("configured"):
        return nvidia.get("model")
    if groq.get("configured"):
        return groq.get("model")
    if nvidia.get("configured"):
        return nvidia.get("model")
    return None


def list_agents(settings: Settings) -> list[dict[str, Any]]:
    nvidia = NvidiaClient(settings).capability()
    groq = GroqClient(settings).capability()
    crew = crew_capability(settings)
    learning = learning_agent_capability(settings)
    preferred = preferred_llm_provider(settings)
    ordered = preferred_llm_providers(settings)
    any_llm = bool(ordered)
    primary_model = _primary_model(settings, nvidia, groq)
    return [
        {
            "id": AGENT_RESUME_IMPROVEMENT,
            "name": "Resume improvement",
            "description": "Evidence-checked resume rewrite suggestions for confirmed sections.",
            "provider": preferred if any_llm else "none",
            "provider_order": ordered,
            "prompt": "improve_resume_v1.txt",
            "configured": any_llm,
            "ready": any_llm,
            "model": primary_model,
            "endpoint": "POST /api/v1/resume-improvements",
            "fallback": "Manual edit and export remain available when no LLM is configured.",
            "orchestration": crew_runtime_mode(),
        },
        {
            "id": AGENT_RESUME_IMPROVEMENT_CREW,
            "name": crew["name"],
            "description": (
                "CrewAI-compatible sequential crew: ATS gap analyst → LLM improver "
                f"(prefers {preferred}) → evidence validator. Tools never invent experience."
            ),
            "provider": preferred if any_llm else "none",
            "provider_order": ordered,
            "prompt": "improve_resume_v1.txt (+ crew tools)",
            "configured": any_llm,
            "ready": bool(crew.get("ready")),
            "model": primary_model,
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
            "provider": preferred if any_llm else "none",
            "provider_order": ordered,
            "prompt": "fill_profile_from_resume_v1.txt",
            "configured": any_llm,
            "ready": True,
            "model": primary_model,
            "endpoint": "POST /api/v1/profile/from-resume/preview",
            "fallback": "Deterministic resume mapping when LLM providers are unavailable.",
        },
        {
            "id": AGENT_INTERVIEW_QUESTIONS,
            "name": "Interview question generation",
            "description": "Generate mock-interview questions for a session.",
            "provider": "groq",
            "prompt": "interview_questions_v1.txt",
            "configured": bool(groq.get("configured")),
            "ready": True,
            "model": groq.get("model") if groq.get("configured") else None,
            "endpoint": "POST /api/v1/interviews/{session_id}/start",
            "fallback": "Local templates when Groq is unavailable (NVIDIA is never used here).",
        },
        {
            "id": AGENT_ATS_IMPROVEMENT_BRIEF,
            "name": "ATS improvement brief",
            "description": "Overall inference from missing ATS keywords only (no invented experience).",
            "provider": preferred if any_llm else "none",
            "provider_order": ordered,
            "prompt": "ats_improvement_v1.txt",
            "configured": any_llm,
            "ready": True,
            "model": primary_model,
            "endpoint": "POST /api/v1/ats-analyses (summary.overall_inference)",
            "fallback": "Deterministic missing-keyword brief when no LLM is available.",
        },
        {
            "id": AGENT_LEARNING_YOUTUBE_CREW,
            "name": learning.get("name") or "Learning path YouTube crew",
            "description": (
                "CrewAI-compatible sequential crew: ATS gap analyst → YouTube planner (Groq) → "
                "resource validator. Recommends free YouTube learning only for completed ATS gaps; "
                "never invents video IDs."
            ),
            "provider": "groq",
            "prompt": "learning_youtube_path_v1.txt (+ crew tools)",
            "configured": bool(groq.get("configured")),
            "ready": True,
            "model": groq.get("model") if groq.get("configured") else None,
            "endpoint": "POST /api/v1/learning-paths/generate",
            "fallback": "Deterministic gap→YouTube search plan when Groq is unavailable.",
            "framework": learning.get("framework"),
            "runtime": learning.get("runtime"),
            "crew_agents": learning.get("agents"),
            "crew_tasks": learning.get("tasks"),
            "algorithm_version": learning.get("algorithm_version"),
            "truthfulness": learning.get("truthfulness"),
        },
        {
            "id": AGENT_DOCUMENT_SECTION_EXTRACT,
            "name": "Document section segregation",
            "description": (
                "Segregates resume/JD plain text into source-true sections using one short LLM call. "
                f"Prefers {preferred} (from LLM_PROVIDER); falls back to the other provider, then structural layout."
            ),
            "provider": preferred if any_llm else "none",
            "provider_order": ordered,
            "prompt": "document_section_extract_v1.txt",
            "configured": any_llm or bool(getattr(settings, "groq_resume_parser_configured", False)),
            "ready": True,
            "model": primary_model,
            "endpoint": "POST /api/v1/resumes, POST /api/v1/job-descriptions",
            "fallback": "Structural layout parser when no LLM is available.",
        },
    ]


def agents_status(settings: Settings) -> dict[str, Any]:
    agents = list_agents(settings)
    nvidia = NvidiaClient(settings).capability()
    groq = GroqClient(settings).capability()
    preferred = preferred_llm_provider(settings)
    ordered = preferred_llm_providers(settings)
    ready_count = sum(1 for a in agents if a.get("ready"))
    configured_llm_agents = sum(1 for a in agents if a.get("configured"))
    return {
        "status": "ok",
        "agent_count": len(agents),
        "ready_count": ready_count,
        "llm_configured_agent_count": configured_llm_agents,
        "preferred_provider": preferred,
        "provider_order": ordered,
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
