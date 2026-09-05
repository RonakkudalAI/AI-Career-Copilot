from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.core.errors import ApiError

logger = logging.getLogger(__name__)


class FreehireClient:
    """Read-only adapter for the public FreeHire job-search API.

    FreeHire is used as a best-effort source. It does not require credentials,
    and failures are surfaced as source-specific errors so another source can
    still complete the sync.
    """

    def __init__(self, base_url: str = "https://freehire.me", *, timeout_seconds: float = 15.0):
        self.base_url = (base_url or "https://freehire.me").rstrip("/")
        self.timeout_seconds = timeout_seconds

    def search_jobs(
        self,
        target_roles: list[str],
        locations: list[str],
        *,
        results_per_page: int = 25,
        max_days_old: int | None = None,
    ) -> list[dict[str, Any]]:
        roles = [str(role).strip() for role in (target_roles or []) if str(role).strip()]
        locs = [str(location).strip() for location in (locations or []) if str(location).strip()]
        query_parts = roles or ["jobs"]
        if locs:
            query_parts.append(" ".join(locs))
        params: dict[str, Any] = {
            "q": " OR ".join(query_parts),
            "limit": max(1, min(int(results_per_page or 25), 50)),
            "offset": 0,
            "semantic_ratio": 0,
            "include_description": "true",
            "description_format": "text",
        }
        if max_days_old is not None:
            params["posted_within_days"] = int(max_days_old)

        try:
            response = httpx.get(
                f"{self.base_url}/api/v1/agent/jobs/search",
                params=params,
                headers={"Accept": "application/json", "User-Agent": "career-copilot-job-search/1.0"},
                timeout=httpx.Timeout(self.timeout_seconds),
            )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.warning("freehire_unavailable error=%s", exc)
            raise ApiError(503, "freehire_unavailable", "FreeHire is temporarily unavailable.") from exc

        if response.status_code == 404:
            raise ApiError(503, "freehire_endpoint_unavailable", "FreeHire search is not available.")
        if response.status_code == 429:
            raise ApiError(429, "freehire_rate_limited", "FreeHire rate limit reached. Try again later.")
        if response.status_code >= 500:
            raise ApiError(503, "freehire_unavailable", "FreeHire is temporarily unavailable.")
        if response.status_code >= 400:
            raise ApiError(502, "freehire_request_rejected", "FreeHire rejected the job search request.")

        try:
            body = response.json()
        except ValueError as exc:
            raise ApiError(502, "freehire_response_unreadable", "FreeHire returned unreadable job data.") from exc

        raw_results = body.get("data") if isinstance(body, dict) else None
        if not isinstance(raw_results, list):
            return []

        jobs: list[dict[str, Any]] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            slug = str(item.get("public_slug") or item.get("id") or "").strip()
            title = str(item.get("title") or "").strip()
            company = str(item.get("company") or "").strip()
            if not slug or not title or not company:
                continue
            description = _clean_text(item.get("description"))[:20_000]
            enrichment = item.get("enrichment") if isinstance(item.get("enrichment"), dict) else {}
            job = {
                "source": "freehire",
                "external_id": slug,
                "title": title[:300],
                "company": company[:200],
                "location": str(item.get("location") or "").strip()[:200] or None,
                "description": description,
                "application_url": item.get("url") or f"https://freehire.me/jobs/{slug}",
                "salary_min": enrichment.get("salary_min"),
                "salary_max": enrichment.get("salary_max"),
                "published_at": item.get("posted_at") or item.get("date"),
                "latitude": None,
                "longitude": None,
                "is_active": True,
                "requirements": [str(skill).strip() for skill in (item.get("skills") or []) if str(skill).strip()],
                "work_mode": item.get("work_mode"),
            }
            if not job["requirements"] and description:
                from app.features.career_matching import _extract_requirement_phrases

                job["requirements"] = _extract_requirement_phrases(description)
            jobs.append(job)
        return jobs


def _clean_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<\s*br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(p|li|ul|ol|div|h\d)>", "\n", text, flags=re.I)
    return re.sub(r"[ \t]+", " ", re.sub(r"<[^>]+>", " ", text)).strip()
