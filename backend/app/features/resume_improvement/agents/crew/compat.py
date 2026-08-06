
from __future__ import annotations

import sys
from importlib.util import find_spec
from typing import Any


def python_supports_official_crewai() -> bool:
    return sys.version_info < (3, 14)
def official_crewai_installed() -> bool:
    return python_supports_official_crewai() and find_spec("crewai") is not None
def try_import_crewai(*, import_module: bool = False) -> tuple[bool, str | None, Any | None]:
    if not python_supports_official_crewai():
        return (
            False,
            f"Official CrewAI requires Python <3.14; running {sys.version_info.major}.{sys.version_info.minor}. "
            "Using Career Copilot CrewAI-compatible orchestrator.",
            None,
        )
    if find_spec("crewai") is None:
        return False, "crewai package not installed", None
    if not import_module:
        return True, None, None
    try:
        import crewai
        return True, None, crewai
    except Exception as exc:
        return False, f"crewai package not installed: {exc}", None
def crew_runtime_mode() -> str:
    return "official_crewai" if official_crewai_installed() else "compatible_orchestrator"
