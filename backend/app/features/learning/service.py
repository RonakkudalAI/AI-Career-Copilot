"""Learning path generation from completed ATS analyses."""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.features.learning.agents.crew import learning_crew_capability, run_learning_youtube_crew
from app.features.learning.youtube_catalog import ALGORITHM_VERSION


async def generate_learning_path_from_ats(
    settings: Settings,
    *,
    evidence_rows: list[dict[str, Any]],
    source_analysis_id: str,
    role_title: str | None = None,
) -> dict[str, Any]:
    """
    Build learning items + YouTube resources from ATS evidence via the learning crew.

    Always returns a structured result; when no gaps exist, items is empty.
    """
    items, audit = await run_learning_youtube_crew(
        settings,
        evidence_rows=evidence_rows,
        source_analysis_id=source_analysis_id,
        role_title=role_title,
    )
    return {
        "items": items,
        "algorithm_version": ALGORITHM_VERSION,
        "crew": {
            "process": audit.process,
            "runtime": audit.runtime,
            "success": audit.success,
            "message": audit.message,
            "tasks": [
                {
                    "name": t.name,
                    "agent_role": t.agent_role,
                    "tool_name": t.tool_name,
                    "status": t.status,
                    "error": t.error,
                    "output": t.output,
                }
                for t in audit.tasks
            ],
            "payload": audit.payload,
        },
    }


def learning_agent_capability(settings: Settings) -> dict[str, Any]:
    return learning_crew_capability(settings)
