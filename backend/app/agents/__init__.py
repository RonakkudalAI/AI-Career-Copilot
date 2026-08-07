
from importlib import import_module
from typing import Any

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
        "app.features.interview.agent",
        "generate_interview_questions",
    ),
    "evaluate_interview_answer": (
        "app.features.interview.agent",
        "evaluate_interview_answer",
    ),
    "generate_interview_session_report": (
        "app.features.interview.agent",
        "generate_interview_session_report",
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
    "evaluate_interview_answer",
    "generate_interview_session_report",
    "list_agents",
    "profile_draft_response_payload",
    "run_resume_improvement_crew",
]
