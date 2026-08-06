from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.errors import ApiError

logger = logging.getLogger(__name__)


class AdzunaClient:
    def __init__(
        self,
        app_id: str,
        app_key: str,
        country: str = "us",
        *,
        timeout_seconds: float = 15.0,
    ):
        self.app_id = (app_id or "").strip()
        self.app_key = (app_key or "").strip()
        self.country = (country or "us").strip().lower() or "us"
        self.timeout_seconds = timeout_seconds
        self.base_url = f"https://api.adzuna.com/v1/api/jobs/{self.country}/search"

    @property
    def configured(self) -> bool:
        return bool(self.app_id and self.app_key)

    def search_jobs(
        self,
        target_roles: list[str],
        locations: list[str],
        results_per_page: int = 50,
        max_days_old: int | None = None,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            raise ApiError(
                503,
                "adzuna_not_configured",
                "External job sync is not configured. Set ADZUNA_APP_ID and ADZUNA_APP_KEY.",
            )

        roles = [str(r).strip() for r in (target_roles or []) if str(r).strip()]
        locs = [str(loc).strip() for loc in (locations or []) if str(loc).strip()]
        what_query = " OR ".join(f'"{r}"' for r in roles) if roles else ""
        where_query = " OR ".join(f'"{loc}"' for loc in locs) if locs else ""
        page_size = max(1, min(int(results_per_page or 50), 50))

        params: dict[str, Any] = {
            "app_id": self.app_id,
            "app_key": self.app_key,
            "results_per_page": page_size,
            "content-type": "application/json",
        }
        if what_query:
            params["what"] = what_query
        if where_query:
            params["where"] = where_query
        if max_days_old is not None:
            params["max_days_old"] = int(max_days_old)

        try:
            response = httpx.get(
                f"{self.base_url}/1",
                params=params,
                timeout=httpx.Timeout(self.timeout_seconds),
            )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.error("adzuna_unavailable error=%s", exc)
            raise ApiError(
                503,
                "adzuna_unavailable",
                "The external job provider is temporarily unavailable.",
            ) from exc

        if response.status_code in {401, 403}:
            raise ApiError(
                503,
                "adzuna_authentication_failed",
                "Adzuna authentication failed. Check ADZUNA_APP_ID and ADZUNA_APP_KEY.",
            )
        if response.status_code == 429:
            raise ApiError(429, "adzuna_rate_limited", "Adzuna rate limit reached. Try again later.")
        if response.status_code >= 500:
            raise ApiError(
                503,
                "adzuna_unavailable",
                "The external job provider is temporarily unavailable.",
            )
        if response.status_code >= 400:
            raise ApiError(
                502,
                "adzuna_request_rejected",
                f"Adzuna rejected the job search request ({response.status_code}).",
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise ApiError(
                502,
                "adzuna_response_unreadable",
                "Adzuna returned an unreadable response.",
            ) from exc

        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            return []

        jobs: list[dict[str, Any]] = []
        for item in results:
            if not isinstance(item, dict):
                continue
            company_obj = item.get("company") if isinstance(item.get("company"), dict) else {}
            company = str(company_obj.get("display_name") or "").strip()
            if not company:
                continue
            location_obj = item.get("location") if isinstance(item.get("location"), dict) else {}
            location = str(location_obj.get("display_name") or "").strip() or None
            external_id = str(item.get("id") or "").strip()
            if not external_id:
                continue
            description = str(item.get("description") or "")[:20_000]
            # Extract known tech phrases so job matching is not title-only.
            from app.features.career_matching import _extract_requirement_phrases, _infer_work_mode

            requirements = _extract_requirement_phrases(description)
            job_row = {
                "source": "adzuna",
                "external_id": external_id,
                "title": str(item.get("title") or "Unknown Title").strip()[:300],
                "company": company[:200],
                "location": (location or "")[:200] or None,
                "description": description,
                "application_url": item.get("redirect_url"),
                "salary_min": item.get("salary_min"),
                "salary_max": item.get("salary_max"),
                "published_at": item.get("created"),
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
                "is_active": True,
                "requirements": requirements,
            }
            work_mode = _infer_work_mode(job_row)
            if work_mode:
                job_row["work_mode"] = work_mode
            jobs.append(job_row)
        return jobs
