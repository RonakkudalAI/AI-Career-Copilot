import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.errors import ApiError
from app.schemas import ProviderSuggestionResult

TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}


class NvidiaClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def capability(self) -> dict[str, Any]:
        return {
            "configured": self.settings.nvidia_configured,
            "model": self.settings.nvidia_model or None,
            "prompt_version": self.settings.nvidia_prompt_version,
        }

    async def generate(self, context: dict[str, Any]) -> ProviderSuggestionResult:
        if not self.settings.nvidia_configured:
            raise ApiError(
                503,
                "nvidia_not_configured",
                "AI improvements are not configured. Manual editing and export remain available.",
            )
        system_prompt = (Path(__file__).parent / "prompts" / "improve_resume_v1.txt").read_text(
            encoding="utf-8"
        )
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
        except (json.JSONDecodeError, ValidationError):
            repair_prompt = (Path(__file__).parent / "prompts" / "repair_structured_output_v1.txt").read_text(
                encoding="utf-8"
            )
            repair_payload = {
                **payload,
                "messages": [
                    {"role": "system", "content": repair_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {"invalid_output": raw, "output_schema": schema}, separators=(",", ":")
                        ),
                    },
                ],
            }
            repaired = await self._request(repair_payload)
            try:
                return self._parse(repaired)
            except (json.JSONDecodeError, ValidationError) as exc:
                raise ApiError(
                    502,
                    "invalid_provider_response",
                    "The AI provider returned an invalid structured response.",
                ) from exc

    def _parse(self, content: str) -> ProviderSuggestionResult:
        if len(content) > 200_000 or content.lstrip().startswith("```"):
            raise json.JSONDecodeError("Non-JSON provider output", content, 0)
        return ProviderSuggestionResult.model_validate(json.loads(content))

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
                        "The AI improvement provider is not configured correctly.",
                    )
                if response.status_code == 429:
                    raise ApiError(
                        429, "nvidia_rate_limited", "The AI provider rate limit was reached. Try again later."
                    )
                if response.status_code >= 500:
                    raise ApiError(503, "nvidia_unavailable", "The AI provider is temporarily unavailable.")
                if response.status_code >= 400:
                    raise ApiError(
                        502, "nvidia_request_rejected", "The AI provider rejected the improvement request."
                    )
                try:
                    body = response.json()
                    content = body["choices"][0]["message"]["content"]
                except (ValueError, KeyError, IndexError, TypeError) as exc:
                    raise ApiError(
                        502, "nvidia_response_unreadable", "The AI provider response could not be read."
                    ) from exc
                if not isinstance(content, str) or not content.strip():
                    raise ApiError(502, "nvidia_empty_response", "The AI provider returned no suggestions.")
                return content
        raise ApiError(503, "nvidia_unavailable", "The AI provider is temporarily unavailable.")
