"""CrewAI package detection.

Official `crewai` on PyPI requires Python >=3.10,<3.14 (as of 2026-07).
This project may run on Python 3.14+, where the package cannot install.
We always provide a CrewAI-compatible sequential orchestrator; when the
real package is importable, optional adapters can use it.
"""

from __future__ import annotations

import sys
from importlib.util import find_spec
from typing import Any


def python_supports_official_crewai() -> bool:
    """Official crewai wheels currently require Python < 3.14."""
    return sys.version_info < (3, 14)


def official_crewai_installed() -> bool:
    """Check installation metadata without importing CrewAI or its settings."""
    return python_supports_official_crewai() and find_spec("crewai") is not None


def try_import_crewai() -> tuple[bool, str | None, Any | None]:
    """
    Returns (available, reason_if_not, module_or_none).
    Never raises — safe for capability checks.
    """
    if not python_supports_official_crewai():
        return (
            False,
            f"Official CrewAI requires Python <3.14; running {sys.version_info.major}.{sys.version_info.minor}. "
            "Using Career Copilot CrewAI-compatible orchestrator.",
            None,
        )
    try:
        import crewai  # type: ignore

        return True, None, crewai
    except Exception as exc:  # pragma: no cover - optional dep
        return False, f"crewai package not installed: {exc}", None


def crew_runtime_mode() -> str:
    return "official_crewai" if official_crewai_installed() else "compatible_orchestrator"
