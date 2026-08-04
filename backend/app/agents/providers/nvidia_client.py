"""NVIDIA Integrate API client (OpenAI-compatible chat completions)."""

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
from app.api.schemas import ProviderSuggestionResult

TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}

# agents/prompts — shared by all agents
PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


class NvidiaClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def capability(self) -> dict[str, Any]:
        return {
            "configured": self.settings.nvidia_configured,
            "model": self.settings.nvidia_model or None,
            "prompt_version": self.settings.nvidia_prompt_version,
            "base_url": self.settings.nvidia_base_url or None,
            "provider": "nvidia",
        }

    async def generate(self, context: dict[str, Any]) -> ProviderSuggestionResult:
        if not self.settings.nvidia_configured:
            raise ApiError(
                503,
                "nvidia_not_configured",
                "AI improvements are not configured. Manual editing and export remain available.",
            )
        system_prompt = (PROMPTS_DIR / "improve_resume_v1.txt").read_text(encoding="utf-8")
        schema = ProviderSuggestionResult.model_json_schema()
        payload = {
            "model": self.settings.nvidia_model,
            "temperature": self.settings.nvidia_temperature,
            "max_tokens": self.settings.nvidia_max_output_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"context": context, "output_schema": schema}, separators=(",", ":")
                    ),
                },
            ],
        }
        raw = await self._request(payload)
        try:
            return self._parse(raw)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            repair_prompt = (PROMPTS_DIR / "repair_structured_output_v1.txt").read_text(encoding="utf-8")
            repair_payload = {
                **payload,
                "messages": [
                    {"role": "system", "content": repair_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {"invalid_output": strip_json_fence(raw)[:12_000], "output_schema": schema},
                            separators=(",", ":"),
                        ),
                    },
                ],
            }
            repaired = await self._request(repair_payload)
            try:
                return self._parse(repaired)
            except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
                raise ApiError(
                    502,
                    "invalid_provider_response",
                    "The AI provider returned an invalid structured response.",
                ) from exc

    def _parse(self, content: str) -> ProviderSuggestionResult:
        data = parse_json_object(content)
        return ProviderSuggestionResult.model_validate(data)

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
    ) -> Any:
        """Call NVIDIA chat/completions and validate JSON against a Pydantic model."""
        if not self.settings.nvidia_configured:
            raise ApiError(
                503,
                "nvidia_not_configured",
                "AI extraction is not configured. Deterministic mapping remains available.",
            )
        schema = schema_model.model_json_schema()
        payload = {
            "model": self.settings.nvidia_model,
            "temperature": self.settings.nvidia_temperature if temperature is None else temperature,
            "max_tokens": self.settings.nvidia_max_output_tokens,
            "response_format": {"type": "json_object"},
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
        raw = await self._request(payload)
        try:
            return schema_model.model_validate(parse_json_object(raw))
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            if not allow_repair:
                raise ApiError(
                    502,
                    "invalid_provider_response",
                    "The AI provider returned an invalid structured response.",
                )
            repair_prompt = (PROMPTS_DIR / "repair_structured_output_v1.txt").read_text(encoding="utf-8")
            repair_payload = {
                **payload,
                "messages": [
                    {"role": "system", "content": repair_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {"invalid_output": strip_json_fence(raw)[:12_000], "output_schema": schema},
                            separators=(",", ":"),
                        ),
                    },
                ],
            }
            repaired = await self._request(repair_payload)
            try:
                return schema_model.model_validate(parse_json_object(repaired))
            except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
                raise ApiError(
                    502,
                    "invalid_provider_response",
                    "The AI provider returned an invalid structured response.",
                ) from exc

    async def _request(self, payload: dict[str, Any]) -> str:
        headers = {
            "Authorization": f"Bearer {self.settings.nvidia_api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(self.settings.nvidia_timeout_seconds)
        attempts = self.settings.nvidia_max_retries + 1
        async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as client:
            for attempt in range(attempts):
                try:
                    response = await client.post(
                        f"{self.settings.nvidia_base_url.rstrip('/')}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt + 1 < attempts:
                        await asyncio.sleep(min(0.25 * (2**attempt), 1.0))
                        continue
                    raise ApiError(
                        503, "nvidia_unavailable", "The AI provider is temporarily unavailable."
                    ) from exc
                if response.status_code in TRANSIENT_STATUS and attempt + 1 < attempts:
                    await asyncio.sleep(min(0.25 * (2**attempt), 1.0))
                    continue
                if response.status_code in {401, 403}:
                    raise ApiError(
                        503,
                        "nvidia_authentication_failed",
                        "The AI improvement provider is not configured correctly. Check NVIDIA_API_KEY.",
                    )
                if response.status_code == 429:
                    raise ApiError(
                        429, "nvidia_rate_limited", "The AI provider rate limit was reached. Try again later."
                    )
                if response.status_code >= 500:
                    raise ApiError(503, "nvidia_unavailable", "The AI provider is temporarily unavailable.")
                if response.status_code >= 400:
                    detail = provider_error_detail(response.text)
                    message = "The AI provider rejected the improvement request."
                    if detail:
                        message = f"{message} ({detail})"
                    raise ApiError(502, "nvidia_request_rejected", message)
                try:
                    body = response.json()
                    content = extract_message_content(body)
                except (ValueError, KeyError, IndexError, TypeError) as exc:
                    raise ApiError(
                        502, "nvidia_response_unreadable", "The AI provider response could not be read."
                    ) from exc
                if not isinstance(content, str) or not content.strip():
                    raise ApiError(502, "nvidia_empty_response", "The AI provider returned no suggestions.")
                return content
        raise ApiError(503, "nvidia_unavailable", "The AI provider is temporarily unavailable.")
