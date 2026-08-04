"""Tests for ATS-grounded YouTube learning crew (no invented video IDs)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from app.features.learning.agents.crew.tools import (
    tool_extract_ats_gaps,
    tool_validate_and_materialize,
)
from app.features.learning.youtube_catalog import (
    build_api_video_resource,
    build_grounded_resource,
    build_search_fallback_resource,
    is_allowed_youtube_url,
    youtube_search_url,
)


def test_extract_only_missing_or_partial_gaps():
    evidence = [
        {"requirement_text": "Docker", "match_status": "not_found"},
        {"requirement_text": "Python", "match_status": "partial_match"},
        {"requirement_text": "SQL", "match_status": "matched"},
        {"requirement_text": "Docker", "match_status": "not_found"},  # duplicate
    ]
    out = tool_extract_ats_gaps({"evidence_rows": evidence, "source_analysis_id": "a1"})
    assert out["allowed_gaps"] == ["Docker", "Python"]
    assert out["gap_count"] == 2


def test_validator_rejects_invented_gap_and_fills_missing():
    class DummySettings:
        youtube_configured = False
        groq_configured = False

    ctx = {
        "allowed_gaps": ["Docker", "Kubernetes"],
        "planner_provider": "test",
        "plan": {
            "recommendations": [
                {
                    "skill_gap": "Docker",
                    "title": "Learn Docker",
                    "objective": "Study Docker with free tutorials for containers.",
                    "youtube_search_query": "Docker tutorial freecodecamp",
                    "estimated_minutes": 45,
                    "difficulty": "foundational",
                },
                {
                    "skill_gap": "Quantum Telepathy",
                    "title": "Hallucinated",
                    "objective": "This skill was not in the ATS analysis and must be dropped.",
                    "youtube_search_query": "quantum telepathy course",
                    "estimated_minutes": 30,
                },
            ]
        },
    }
    out = asyncio.run(tool_validate_and_materialize(DummySettings(), ctx))  # type: ignore[arg-type]
    assert out["accepted_count"] == 2
    requirements = {item["metadata"]["requirement"] for item in out["items"]}
    assert requirements == {"Docker", "Kubernetes"}
    assert any("Quantum Telepathy" in r or "gap_not_in_ats_evidence" in r for r in out["rejected"])
    for item in out["items"]:
        for resource in item["resources"]:
            assert is_allowed_youtube_url(resource["url"])
            assert "youtube.com" in resource["url"]


def test_api_video_resource_uses_exact_watch_url():
    resource = build_api_video_resource(
        gap="Docker",
        video={
            "video_id": "abc123XYZ01",
            "title": "Docker Tutorial for Beginners",
            "channel_title": "freeCodeCamp.org",
            "url": "https://www.youtube.com/watch?v=abc123XYZ01",
            "thumbnail_url": "https://i.ytimg.com/vi/abc123XYZ01/mqdefault.jpg",
            "description_snippet": "Learn Docker",
            "search_query": "Docker tutorial",
        },
    )
    assert resource["resource_type"] == "youtube_video"
    assert resource["url"] == "https://www.youtube.com/watch?v=abc123XYZ01"
    assert resource["metadata"]["video_id"] == "abc123XYZ01"
    assert resource["metadata"]["video_id_policy"] == "youtube_api_only_no_invented_ids"
    assert is_allowed_youtube_url(resource["url"])


def test_grounded_resource_prefers_api_videos():
    resources = build_grounded_resource(
        gap="Rust",
        search_query="Rust tutorial",
        api_videos=[
            {
                "video_id": "rustVid001",
                "title": "Rust Crash Course",
                "channel_title": "Traversy Media",
                "url": "https://www.youtube.com/watch?v=rustVid001",
                "thumbnail_url": "",
                "description_snippet": "",
                "search_query": "Rust tutorial",
            }
        ],
    )
    assert len(resources) == 1
    assert resources[0]["resource_type"] == "youtube_video"
    assert "/watch?v=rustVid001" in resources[0]["url"]


def test_fallback_is_search_not_fake_watch():
    resource = build_search_fallback_resource(gap="Rust", search_query="Rust tutorial freecodecamp")
    assert resource["resource_type"] == "youtube_search"
    assert is_allowed_youtube_url(resource["url"])
    assert "/results" in resource["url"]
    assert "/watch" not in resource["url"]


def test_search_url_encoding():
    url = youtube_search_url("C++ basics for beginners")
    assert url.startswith("https://www.youtube.com/results?search_query=")
    assert is_allowed_youtube_url(url)


def test_validator_uses_youtube_api_when_available():
    class DummySettings:
        youtube_configured = True
        youtube_search_max_results = 2
        youtube_api_key = "test"
        youtube_api_base_url = "https://www.googleapis.com/youtube/v3"
        youtube_timeout_seconds = 10.0

    ctx = {
        "allowed_gaps": ["Docker"],
        "planner_provider": "test",
        "plan": {
            "recommendations": [
                {
                    "skill_gap": "Docker",
                    "title": "Learn Docker",
                    "objective": "Study Docker containers with free tutorials.",
                    "youtube_search_query": "Docker tutorial",
                    "estimated_minutes": 45,
                    "difficulty": "foundational",
                }
            ]
        },
    }
    fake_videos = [
        {
            "video_id": "dckr111aaa",
            "title": "Docker Tutorial for Beginners",
            "channel_title": "freeCodeCamp.org",
            "url": "https://www.youtube.com/watch?v=dckr111aaa",
            "thumbnail_url": "https://i.ytimg.com/vi/dckr111aaa/mqdefault.jpg",
            "description_snippet": "Learn Docker",
            "search_query": "Docker tutorial",
        }
    ]
    with patch(
        "app.features.learning.agents.crew.tools.search_youtube_videos",
        new=AsyncMock(return_value=fake_videos),
    ):
        out = asyncio.run(tool_validate_and_materialize(DummySettings(), ctx))  # type: ignore[arg-type]
    assert out["accepted_count"] == 1
    assert out["youtube_api_video_steps"] == 1
    resource = out["items"][0]["resources"][0]
    assert resource["resource_type"] == "youtube_video"
    assert resource["url"] == "https://www.youtube.com/watch?v=dckr111aaa"
    assert resource["metadata"]["video_id"] == "dckr111aaa"


def test_crew_run_end_to_end_without_llm():
    from app.features.learning.agents.crew.orchestrator import run_learning_youtube_crew

    class DummySettings:
        groq_configured = False
        nvidia_configured = False
        youtube_configured = False

    evidence = [
        {"requirement_text": "Docker", "match_status": "not_found"},
        {"requirement_text": "Git", "match_status": "not_found"},
    ]
    items, audit = asyncio.run(
        run_learning_youtube_crew(
            DummySettings(),  # type: ignore[arg-type]
            evidence_rows=evidence,
            source_analysis_id="analysis-1",
            role_title="Backend Engineer",
        )
    )
    assert audit.success is True
    assert len(items) == 2
    assert all(item["resources"] for item in items)
    assert all(is_allowed_youtube_url(item["resources"][0]["url"]) for item in items)
