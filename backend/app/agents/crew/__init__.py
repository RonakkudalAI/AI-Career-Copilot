"""
CrewAI-compatible multi-agent orchestration for Career Copilot.

- Official `crewai` PyPI package requires Python <3.14; when unavailable we use
  the built-in sequential orchestrator (same Agent/Task process model).
- All tools are truth-bound wrappers around existing agents/validators.
"""

from app.agents.crew.compat import crew_runtime_mode, try_import_crewai
from app.agents.crew.orchestrator import crew_capability, run_resume_improvement_crew

__all__ = [
    "crew_capability",
    "crew_runtime_mode",
    "run_resume_improvement_crew",
    "try_import_crewai",
]
