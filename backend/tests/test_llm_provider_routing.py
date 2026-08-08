"""LLM_PROVIDER must control agent provider order (Groq-first by default)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.agents.providers.routing import preferred_llm_provider, preferred_llm_providers
from app.core.config import Settings
from app.features.profile.agent import pipeline as profile_pipeline
from app.features.resume_improvement.agents.crew import tools as resume_tools


def test_preferred_order_groq_first():
    settings = SimpleNamespace(
        llm_provider="groq",
        groq_configured=True,
        nvidia_configured=True,
    )
    assert preferred_llm_provider(settings) == "groq"
    assert preferred_llm_providers(settings) == ["groq", "nvidia"]


def test_preferred_order_nvidia_first():
    settings = SimpleNamespace(
        llm_provider="nvidia",
        groq_configured=True,
        nvidia_configured=True,
    )
    assert preferred_llm_providers(settings) == ["nvidia", "groq"]


def test_preferred_skips_unconfigured():
    settings = SimpleNamespace(
        llm_provider="nvidia",
        groq_configured=True,
        nvidia_configured=False,
    )
    assert preferred_llm_providers(settings) == ["groq"]


def test_omniroute_does_not_impersonate_provider_credentials():
    settings = Settings.model_construct(
        nvidia_api_key="",
        nvidia_model="nvidia-model",
        nvidia_base_url="https://nvidia.example/v1",
        groq_api_key="",
        groq_model="groq-model",
        groq_base_url="https://groq.example/v1",
        omniroute_enabled=True,
        omniroute_model="auto",
        omniroute_base_url="http://127.0.0.1:20128/v1",
        llm_provider="groq",
    )
    assert settings.groq_configured is False
    assert settings.nvidia_configured is False
    assert settings.omniroute_configured is True
    assert preferred_llm_providers(settings) == ["groq"]


def test_resume_suggestions_prefer_groq(monkeypatch):
    order: list[str] = []

    class Ok:
        suggestions = []

    async def groq_gen(self, context):
        order.append("groq")
        return Ok()

    async def nvidia_gen(self, context):
        order.append("nvidia")
        raise AssertionError("should not call nvidia first")

    monkeypatch.setattr(resume_tools.GroqClient, "generate", groq_gen)
    monkeypatch.setattr(resume_tools.NvidiaClient, "generate", nvidia_gen)

    settings = SimpleNamespace(
        llm_provider="groq",
        groq_configured=True,
        nvidia_configured=True,
    )
    result = asyncio.run(resume_tools.tool_generate_resume_suggestions(settings, {}))
    assert order == ["groq"]
    assert result.suggestions == []


def test_profile_fill_prefers_groq(monkeypatch):
    order: list[str] = []

    class FakeResult:
        profile = SimpleNamespace(
            full_name="Ada",
            headline=None,
            bio=None,
            phone=None,
            location=None,
            current_role=None,
            years_experience=None,
            career_level=None,
        )
        skills = []
        experiences = []
        education = []
        projects = []
        certifications = []
        languages = []
        links = []

    async def groq_structured(self, **_kwargs):
        order.append("groq")
        return FakeResult()

    async def nvidia_structured(self, **_kwargs):
        order.append("nvidia")
        raise AssertionError("should not call nvidia first")

    monkeypatch.setattr(profile_pipeline.GroqClient, "generate_structured", groq_structured)
    monkeypatch.setattr(profile_pipeline.NvidiaClient, "generate_structured", nvidia_structured)
    monkeypatch.setattr(
        profile_pipeline,
        "_llm_to_draft",
        lambda _result: {
            "profile": {"full_name": "Ada"},
            "skills": [],
            "experiences": [],
            "education": [],
            "projects": [],
            "certifications": [],
            "languages": [],
            "links": [],
            "meta": {},
        },
    )
    monkeypatch.setattr(
        profile_pipeline,
        "merge_profile_drafts",
        lambda base, ai, plain_text=None: {
            **base,
            "profile": {**(base.get("profile") or {}), **(ai.get("profile") or {})},
            "meta": dict(base.get("meta") or {}),
        },
    )

    settings = SimpleNamespace(
        llm_provider="groq",
        groq_configured=True,
        nvidia_configured=True,
        groq_temperature=0.2,
        nvidia_temperature=0.2,
        groq_timeout_seconds=12,
        nvidia_timeout_seconds=12,
    )
    result = asyncio.run(
        profile_pipeline.build_profile_draft_enriched(
            "Ada Lovelace\nEngineer\nPython",
            {"sections": {"summary": ["Engineer"], "skills": ["Python"]}},
            settings,
        )
    )
    assert order == ["groq"]
    assert (result.get("meta") or {}).get("provider") == "groq"
