"""
Groq OpenAI-compatible chat client.

Used for dedicated tasks (mock interview questions, optional ATS brief).
This is intentionally separate from NVIDIA and must NOT be wired as an
NVIDIA fallback for resume improvement / profile fill.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError

from app.agents.providers.common import (
    extract_message_content,
    parse_json_object,
    provider_error_detail,
    strip_json_fence,
)
from app.core.config import Settings
from app.core.errors import ApiError

TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}
PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Make a Pydantic JSON schema acceptable to Groq strict structured outputs."""
    result = dict(schema)
    result.pop("title", None)
    result.pop("default", None)
    result["additionalProperties"] = False
    properties = result.get("properties")
    if isinstance(properties, dict):
        result["required"] = list(properties)
        result["properties"] = {
            key: _strict_schema(value) if isinstance(value, dict) else value
            for key, value in properties.items()
        }
    for key in ("items",):
        value = result.get(key)
        if isinstance(value, dict):
            result[key] = _strict_schema(value)
    for key in ("anyOf", "oneOf", "allOf"):
        value = result.get(key)
        if isinstance(value, list):
            result[key] = [
                _strict_schema(item) if isinstance(item, dict) else item
                for item in value
            ]
    defs = result.get("$defs")
    if isinstance(defs, dict):
        result["$defs"] = {
            key: _strict_schema(value) if isinstance(value, dict) else value
            for key, value in defs.items()
        }
    return result


class GroqClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def capability(self) -> dict[str, Any]:
        return {
            "configured": self.settings.groq_configured,
            "model": self.settings.groq_model or None,
            "provider": "groq",
            "base_url": self.settings.groq_base_url or None,
            "tasks": ["interview_questions", "ats_improvement_brief", "learning_youtube_path"],
        }

    def _strip_json_fence(self, content: str) -> str:
        return strip_json_fence(content)

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        schema_model: type,
        temperature: float | None = None,
        allow_repair: bool = True,
        model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        strict_schema: bool = False,
    ) -> Any:
        if not self.settings.groq_configured:
            raise ApiError(
                503,
                "groq_not_configured",
                "Groq is not configured. Set GROQ_API_KEY and GROQ_MODEL for interview questions.",
            )
        schema = schema_model.model_json_schema()
        response_format: dict[str, Any] = {"type": "json_object"}
        if strict_schema:
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "resume_extraction",
                    "strict": True,
                    "schema": _strict_schema(schema),
                },
            }
        payload = {
            "model": model or self.settings.groq_model,
            "temperature": self.settings.groq_temperature if temperature is None else temperature,
            "max_tokens": self.settings.groq_max_output_tokens,
            "response_format": response_format,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"input": user_payload, "output_schema": schema},
                        separators=(",", ":"),
                    ),
                },
            ],
        }
        raw = await self._request(payload, timeout_seconds=timeout_seconds, max_retries=max_retries)
        try:
            return schema_model.model_validate(parse_json_object(raw))
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            if not allow_repair:
                raise ApiError(
                    502,
                    "invalid_groq_response",
                    "Groq returned an invalid structured response.",
                )
            # One repair pass (parity with NVIDIA client).
            repair_path = PROMPTS_DIR / "repair_structured_output_v1.txt"
            repair_prompt = (
                repair_path.read_text(encoding="utf-8")
                if repair_path.is_file()
                else "Return only valid JSON matching the provided output_schema."
            )
            repair_payload = {
                **payload,
                "messages": [
                    {"role": "system", "content": repair_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "invalid_output": strip_json_fence(raw)[:12_000],
                                "output_schema": schema,
                            },
                            separators=(",", ":"),
                        ),
                    },
                ],
            }
            repaired = await self._request(
                repair_payload, timeout_seconds=timeout_seconds, max_retries=max_retries
            )
            try:
                return schema_model.model_validate(parse_json_object(repaired))
            except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
                raise ApiError(
                    502,
                    "invalid_groq_response",
                    "Groq returned an invalid structured response after repair.",
                ) from exc

    async def _request(
        self,
        payload: dict[str, Any],
        *,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {self.settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(timeout_seconds or self.settings.groq_timeout_seconds)
        attempts = (self.settings.groq_max_retries if max_retries is None else max_retries) + 1
        async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as client:
            for attempt in range(attempts):
                try:
                    response = await client.post(
                        f"{self.settings.groq_base_url.rstrip('/')}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt + 1 < attempts:
                        await asyncio.sleep(min(0.25 * (2**attempt), 1.0))
                        continue
                    raise ApiError(503, "groq_unavailable", "Groq is temporarily unavailable.") from exc
                if response.status_code in TRANSIENT_STATUS and attempt + 1 < attempts:
                    await asyncio.sleep(min(0.25 * (2**attempt), 1.0))
                    continue
                if response.status_code in {401, 403}:
                    raise ApiError(
                        503,
                        "groq_authentication_failed",
                        "Groq API authentication failed. Check GROQ_API_KEY.",
                    )
                if response.status_code == 429:
                    raise ApiError(429, "groq_rate_limited", "Groq rate limit reached. Try again later.")
                if response.status_code >= 500:
                    raise ApiError(503, "groq_unavailable", "Groq is temporarily unavailable.")
                if response.status_code >= 400:
                    detail = provider_error_detail(response.text)
                    message = "Groq rejected the request."
                    if detail:
                        message = f"{message} ({detail})"
                    raise ApiError(502, "groq_request_rejected", message)
                try:
                    body = response.json()
                    content = extract_message_content(body)
                except (ValueError, KeyError, IndexError, TypeError) as exc:
                    raise ApiError(
                        502, "groq_response_unreadable", "Groq response could not be read."
                    ) from exc
                if not isinstance(content, str) or not content.strip():
                    raise ApiError(502, "groq_empty_response", "Groq returned an empty response.")
                return content
        raise ApiError(503, "groq_unavailable", "Groq is temporarily unavailable.")
