from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agents.providers.groq_client import GroqClient
from app.agents.providers.nvidia_client import NvidiaClient
from app.agents.providers.routing import preferred_llm_providers
from app.core.errors import ApiError

logger = logging.getLogger(__name__)


async def generate_structured_with_failover(
    settings: Any,
    *,
    system_prompt: str,
    user_payload: dict[str, Any],
    schema_model: type,
    temperature: float | None = None,
    attempts_per_provider: int = 2,
    allow_repair: bool = True,
    timeout_seconds: float | None = None,
) -> tuple[Any, str]:
    """Generate validated LLM output, retrying providers without static content.

    Provider clients already retry transport-level transient failures. This
    helper retries the complete structured generation contract and then moves
    to the next configured provider. It never returns a template or inferred
    answer; callers receive an explicit ApiError when no provider produces a
    schema-valid response.
    """
    providers = preferred_llm_providers(settings)
    if not providers:
        raise ApiError(
            503,
            "llm_not_configured",
            "No LLM provider is configured. Configure a provider and retry.",
        )

    attempts = max(1, min(int(attempts_per_provider or 1), 3))
    failures: list[str] = []
    for provider in providers:
        client = GroqClient(settings) if provider == "groq" else NvidiaClient(settings)
        for attempt in range(1, attempts + 1):
            try:
                kwargs: dict[str, Any] = {
                    "system_prompt": system_prompt,
                    "user_payload": user_payload,
                    "schema_model": schema_model,
                }
                if temperature is not None:
                    kwargs["temperature"] = temperature
                kwargs["allow_repair"] = allow_repair
                if timeout_seconds is not None:
                    kwargs["timeout_seconds"] = timeout_seconds
                # The outer loop owns retries for structured agent calls. Do
                # not multiply latency with an inner transport retry loop.
                if provider == "groq":
                    kwargs["max_retries"] = 0
                else:
                    kwargs["max_retries"] = 0
                result = await client.generate_structured(**kwargs)
                if result is None:
                    raise ApiError(
                        502,
                        "invalid_llm_response",
                        "The LLM returned an empty structured response. Retry the request.",
                    )
                return result, provider
            except Exception as exc:
                reason = getattr(exc, "code", None) or type(exc).__name__
                failures.append(f"{provider}:{reason}")
                logger.warning(
                    "llm_generation_attempt_failed provider=%s attempt=%d/%d reason=%s",
                    provider,
                    attempt,
                    attempts,
                    reason,
                )
                if attempt < attempts:
                    await asyncio.sleep(0.2)

    raise ApiError(
        503,
        "llm_generation_failed",
        "The configured LLM providers did not return a valid answer after retrying. Retry the request.",
        details={"attempts": failures},
    )
