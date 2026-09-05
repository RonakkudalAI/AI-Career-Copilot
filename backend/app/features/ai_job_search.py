"""Native Python port of the ai-job-search repository's search workflow.

The upstream project exposes portal skills as Bun CLIs. Career Copilot is a
FastAPI application, so this module keeps the same read-only FreeHire contract
but executes it through the existing Python adapter instead of spawning Bun.
"""

from __future__ import annotations

from typing import Any

from app.features.freehire_api import FreehireClient


class AiJobSearchClient:
    """Run the configured native job-search sources for a candidate."""

    workflow = "ai-job-search-native-python"

    def __init__(self, base_url: str, *, timeout_seconds: float):
        self.freehire = FreehireClient(base_url, timeout_seconds=timeout_seconds)

    def search_jobs(
        self,
        target_roles: list[str],
        locations: list[str],
        *,
        results_per_page: int,
        max_days_old: int | None,
    ) -> list[dict[str, Any]]:
        # FreeHire is the upstream repository's structured, public source. The
        # client already maps its {data, meta} response to our jobs schema.
        return self.freehire.search_jobs(
            target_roles=target_roles,
            locations=locations,
            results_per_page=results_per_page,
            max_days_old=max_days_old,
        )
