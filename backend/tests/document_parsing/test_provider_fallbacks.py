import asyncio
import json
import time
from types import SimpleNamespace

import httpx
from pydantic import BaseModel

from app.agents.providers.groq_client import GroqClient
from app.agents.providers.routing import provider_route
from app.core.errors import ApiError
from app.features.document_parsing import pipeline as document_pipeline
from app.features.document_parsing.parsing import llm_sections
from app.features.profile.agent import pipeline as profile_pipeline


def test_section_extraction_falls_back_when_nvidia_is_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise ApiError(503, "nvidia_unavailable", "provider unavailable")

    monkeypatch.setattr(llm_sections, "_llm_segregate", unavailable)
    settings = SimpleNamespace(
        nvidia_configured=True,
        groq_configured=False,
        groq_resume_parser_configured=False,
    )

    result = asyncio.run(
        llm_sections.extract_sections_enriched(
            "SUMMARY\nBackend engineer\nSKILLS\nPython, FastAPI",
            settings,
        )
    )

    assert result["sections"]
    assert result["extraction_method"] == "structural_layout_v1"
    assert any("structural layout" in warning.lower() for warning in result["warnings"])


def test_profile_draft_falls_back_when_nvidia_is_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise ApiError(503, "nvidia_unavailable", "provider unavailable")

    monkeypatch.setattr(profile_pipeline.NvidiaClient, "generate_structured", unavailable)
    settings = SimpleNamespace(nvidia_configured=True, nvidia_temperature=0.2)

    result = asyncio.run(
        profile_pipeline.build_profile_draft_enriched(
            "Priyansu Pattanaik\nBackend Engineer\nPython, FastAPI",
            {"sections": {"summary": ["Backend Engineer"], "skills": ["Python, FastAPI"]}},
            settings,
        )
    )

    assert result["meta"]["fallback"] is True
    assert result["meta"]["provider"] == "deterministic"
    assert result["meta"]["ai_used"] is False


def test_saved_document_parsing_never_waits_for_a_remote_provider(monkeypatch):
    calls = []

    def extract_text(_content, _mime_type):
        return "SUMMARY\nBackend engineer\nSKILLS\nPython, FastAPI"

    async def extract_sections(text, _settings, *, schema_version, prefer_llm):
        calls.append({"text": text, "prefer_llm": prefer_llm})
        return {
            "schema_version": schema_version,
            "sections": {"summary": ["Backend engineer"], "skills": ["Python, FastAPI"]},
            "warnings": [],
            "extraction_method": "structural_layout_v1",
        }

    monkeypatch.setattr(document_pipeline, "extract_text", extract_text)
    monkeypatch.setattr(document_pipeline, "extract_sections_enriched", extract_sections)

    plain_text, structured = asyncio.run(
        document_pipeline.parse_document_bytes(
            b"pdf bytes",
            mime_type="application/pdf",
            settings=SimpleNamespace(nvidia_configured=True),
        )
    )

    assert plain_text.startswith("SUMMARY")
    assert structured["sections"]["skills"] == ["Python, FastAPI"]
    assert calls == [{"text": plain_text, "prefer_llm": False}]


def test_optional_profile_ai_has_a_short_total_timeout(monkeypatch):
    async def slow_provider(*_args, **_kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(profile_pipeline.NvidiaClient, "generate_structured", slow_provider)
    settings = SimpleNamespace(
        nvidia_configured=True,
        nvidia_temperature=0.2,
        nvidia_timeout_seconds=0.01,
    )

    started = time.perf_counter()
    result = asyncio.run(
        profile_pipeline.build_profile_draft_enriched(
            "Priyansu Pattanaik\nBackend Engineer\nPython, FastAPI",
            {"sections": {"summary": ["Backend Engineer"], "skills": ["Python, FastAPI"]}},
            settings,
        )
    )

    assert time.perf_counter() - started < 0.25
    assert result["meta"]["fallback"] is True
    assert result["meta"]["provider"] == "deterministic"


def test_omniroute_route_is_opt_in_and_openai_compatible():
    settings = SimpleNamespace(
        omniroute_configured=True,
        omniroute_base_url="http://127.0.0.1:20128/v1",
        omniroute_api_key="",
        omniroute_model="auto/fast",
        omniroute_timeout_seconds=7.0,
        omniroute_max_retries=0,
        groq_base_url="https://api.groq.com/openai/v1",
        groq_api_key="groq-key",
        groq_model="groq-model",
        groq_timeout_seconds=45.0,
        groq_max_retries=2,
        nvidia_base_url="https://integrate.api.nvidia.com/v1",
        nvidia_api_key="nvidia-key",
        nvidia_model="nvidia-model",
        nvidia_timeout_seconds=90.0,
        nvidia_max_retries=2,
    )

    route = provider_route(settings, "groq")

    assert route == {
        "provider": "omniroute",
        "base_url": "http://127.0.0.1:20128/v1",
        "api_key": "",
        "model": "auto/fast",
        "timeout_seconds": 7.0,
        "max_retries": 0,
    }


def test_groq_client_sends_openai_request_to_omniroute():
    class Result(BaseModel):
        answer: str

    captured = {}

    async def handler(request):
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"answer":"ok"}'}}]},
        )

    settings = SimpleNamespace(
        omniroute_configured=True,
        omniroute_base_url="http://127.0.0.1:20128/v1",
        omniroute_api_key="",
        omniroute_model="auto",
        omniroute_timeout_seconds=7.0,
        omniroute_max_retries=0,
        groq_configured=True,
        groq_model="unused",
        groq_temperature=0.4,
        groq_max_output_tokens=256,
        groq_timeout_seconds=45.0,
        groq_max_retries=2,
        llm_allow_repair=False,
        llm_rpm_limit=600.0,
    )

    result = asyncio.run(
        GroqClient(settings, transport=httpx.MockTransport(handler)).generate_structured(
            system_prompt="Return JSON.",
            user_payload={"value": 1},
            schema_model=Result,
        )
    )

    assert result.answer == "ok"
    assert captured["url"] == "http://127.0.0.1:20128/v1/chat/completions"
    assert captured["authorization"] is None
    assert captured["body"]["model"] == "auto"
