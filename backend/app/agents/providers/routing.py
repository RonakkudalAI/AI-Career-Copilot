from __future__ import annotations

from typing import Any, Literal

from app.core.config import Settings

ProviderName = Literal["groq", "nvidia"]


def preferred_llm_provider(settings: Any) -> ProviderName:
    """Primary provider from LLM_PROVIDER (default groq)."""
    raw = str(getattr(settings, "llm_provider", None) or "groq").strip().lower()
    if raw in {"groq", "nvidia"}:
        return raw  # type: ignore[return-value]
    return "groq"


def preferred_llm_providers(settings: Any) -> list[ProviderName]:
    """Configured providers in preference order (primary first).

    Agents must try this order so LLM_PROVIDER=groq never waits on NVIDIA first.
    """
    primary = preferred_llm_provider(settings)
    candidates: list[ProviderName] = [primary]
    for name in ("groq", "nvidia"):
        if name not in candidates:
            candidates.append(name)  # type: ignore[arg-type]

    ordered: list[ProviderName] = []
    for name in candidates:
        if name == "groq" and bool(getattr(settings, "groq_configured", False)):
            ordered.append("groq")
        elif name == "nvidia" and bool(getattr(settings, "nvidia_configured", False)):
            ordered.append("nvidia")
    # OmniRoute is an adapter behind the selected logical provider. Keep that
    # route usable without reporting Groq or NVIDIA credentials as configured.
    if not ordered and bool(getattr(settings, "omniroute_configured", False)):
        ordered.append(primary)
    return ordered


def any_llm_configured(settings: Any) -> bool:
    return bool(
        getattr(settings, "groq_configured", False)
        or getattr(settings, "nvidia_configured", False)
        or getattr(settings, "groq_resume_parser_configured", False)
        or getattr(settings, "omniroute_configured", False)
    )


def provider_route(settings: Settings, provider: str) -> dict[str, Any]:
    """Return the endpoint credentials for a logical provider.

    OmniRoute is intentionally an adapter, not a required application service.
    When disabled, callers receive their original Groq/NVIDIA configuration.
    """
    if bool(getattr(settings, "omniroute_configured", False)):
        return {
            "provider": "omniroute",
            "base_url": settings.omniroute_base_url,
            "api_key": settings.omniroute_api_key,
            "model": settings.omniroute_model,
            "timeout_seconds": settings.omniroute_timeout_seconds,
            "max_retries": settings.omniroute_max_retries,
        }
    if provider == "groq":
        return {
            "provider": "groq",
            "base_url": settings.groq_base_url,
            "api_key": settings.groq_api_key,
            "model": settings.groq_model,
            "timeout_seconds": settings.groq_timeout_seconds,
            "max_retries": settings.groq_max_retries,
        }
    return {
        "provider": "nvidia",
        "base_url": settings.nvidia_base_url,
        "api_key": settings.nvidia_api_key,
        "model": settings.nvidia_model,
        "timeout_seconds": settings.nvidia_timeout_seconds,
        "max_retries": settings.nvidia_max_retries,
    }
