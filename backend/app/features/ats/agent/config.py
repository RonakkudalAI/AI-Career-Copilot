from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings


Provider = Literal["groq", "nvidia"]


@dataclass(frozen=True)
class LLMSettings:
    provider: Provider
    model: str
    base_url: str
    api_key: str
    temperature: float = 0.1


def get_llm_settings(provider: str | None = None) -> LLMSettings:
    project_settings = get_settings()
    selected = (provider or project_settings.llm_provider or "groq").lower()
    if selected not in {"groq", "nvidia"}:
        raise ValueError("LLM_PROVIDER must be 'groq' or 'nvidia'")
    if selected == "groq":
        return LLMSettings(
            provider="groq",
            model=project_settings.groq_model,
            base_url=project_settings.groq_base_url,
            api_key=project_settings.groq_api_key,
        )
    return LLMSettings(
        provider="nvidia",
        model=project_settings.nvidia_model,
        base_url=project_settings.nvidia_base_url,
        api_key=project_settings.nvidia_api_key,
    )


def get_llm(provider: str | None = None):
    """Return the CrewAI-native LLM for the configured OpenAI-compatible provider."""
    settings = get_llm_settings(provider)
    if not settings.api_key:
        raise RuntimeError(f"{settings.provider.upper()}_API_KEY is not configured")
    try:
        from crewai import LLM
    except ImportError as exc:
        raise RuntimeError("CrewAI is required for ATS scoring") from exc
    return LLM(
        model=f"openai/{settings.model}",
        temperature=settings.temperature,
        api_key=settings.api_key,
        base_url=settings.base_url,
    )
