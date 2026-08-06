from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors import ApiError
from app.features.adzuna_api import AdzunaClient


def test_adzuna_client_requires_credentials():
    client = AdzunaClient("", "")
    with pytest.raises(ApiError) as exc:
        client.search_jobs(["engineer"], ["remote"])
    assert exc.value.code == "adzuna_not_configured"


def test_adzuna_client_maps_results():
    payload = {
        "results": [
            {
                "id": "123",
                "title": "Backend Engineer",
                "company": {"display_name": "Acme"},
                "location": {"display_name": "Remote"},
                "description": "Build APIs",
                "redirect_url": "https://example.com/job/123",
                "salary_min": 100000,
                "salary_max": 140000,
                "created": "2026-01-01T00:00:00Z",
                "latitude": 37.7,
                "longitude": -122.4,
            },
            {
                "id": "skip",
                "title": "No company",
                "company": {},
            },
        ]
    }
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = payload

    with patch("app.features.adzuna_api.httpx.get", return_value=mock_response) as get:
        client = AdzunaClient("app", "key", "us", timeout_seconds=5)
        jobs = client.search_jobs(["Backend Engineer"], ["Remote"])

    assert len(jobs) == 1
    assert jobs[0]["external_id"] == "123"
    assert jobs[0]["company"] == "Acme"
    assert jobs[0]["source"] == "adzuna"
    get.assert_called_once()


def test_sync_external_jobs_persists_new_and_updates(monkeypatch):
    from app.api import router as api_router

    settings = SimpleNamespace(
        adzuna_app_id="app",
        adzuna_app_key="key",
        adzuna_country="us",
        adzuna_timeout_seconds=5.0,
        adzuna_results_per_page=20,
        adzuna_max_days_old=14,
    )
    user = SimpleNamespace(id="user-1")

    jobs_table = MagicMock()
    prefs_table = MagicMock()
    client = MagicMock()

    def table(name: str):
        if name == "candidate_preferences":
            return prefs_table
        if name == "jobs":
            return jobs_table
        return MagicMock()

    client.table.side_effect = table

    prefs_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[{"target_roles": ["Engineer"], "preferred_locations": ["Remote"]}]
    )

    jobs_table.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "job-existing", "external_id": "a2"}]
    )
    jobs_table.insert.return_value.execute.return_value = SimpleNamespace(data=[{"id": "new"}])
    jobs_table.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "job-existing"}]
    )

    fetched = [
        {
            "source": "adzuna",
            "external_id": "a1",
            "title": "Role A",
            "company": "Co A",
            "location": "Remote",
            "description": "desc",
            "application_url": "https://example.com/a",
            "salary_min": 1,
            "salary_max": 2,
            "published_at": "2026-01-01T00:00:00Z",
            "latitude": 1.0,
            "longitude": 2.0,
            "requirements": [],
        },
        {
            "source": "adzuna",
            "external_id": "a2",
            "title": "Role B",
            "company": "Co B",
            "location": "NYC",
            "description": "desc",
            "application_url": None,
            "salary_min": None,
            "salary_max": None,
            "published_at": None,
            "latitude": None,
            "longitude": None,
            "requirements": [],
        },
    ]

    with (
        patch.object(api_router, "client_for", return_value=client),
        patch.object(api_router, "write_activity"),
        patch("app.features.adzuna_api.AdzunaClient.search_jobs", return_value=fetched),
    ):
        result = api_router.sync_external_jobs(user=user, settings=settings)

    assert result["fetched"] == 2
    assert result["created"] == 1
    assert result["updated"] == 1
    assert jobs_table.insert.called
    assert jobs_table.update.called
