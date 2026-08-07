"""
Fish Audio TTS client for mock-interview interviewer voice.

Keeps the API key server-side. Returns raw audio bytes for the browser to play.
Falls back is handled by the caller (browser speechSynthesis) when not configured
or when the remote call fails.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

# Conservative limit so a single request cannot spam the TTS provider.
MAX_TTS_CHARS = 1_200


def fish_audio_configured(settings: Settings) -> bool:
    return bool((settings.fish_audio_api_key or "").strip())


def synthesize_speech(
    settings: Settings,
    text: str,
    *,
    format: str = "mp3",
) -> tuple[bytes, str]:
    """
    Convert text to speech via Fish Audio.

    Returns (audio_bytes, media_type).
    Raises ValueError for bad input; raises RuntimeError / httpx errors for remote failures.
    """
    cleaned = " ".join(str(text or "").split()).strip()
    if not cleaned:
        raise ValueError("TTS text is required")
    if len(cleaned) > MAX_TTS_CHARS:
        cleaned = cleaned[:MAX_TTS_CHARS].rstrip() + "…"

    if not fish_audio_configured(settings):
        raise RuntimeError("Fish Audio is not configured")

    base = (settings.fish_audio_base_url or "https://api.fish.audio").rstrip("/")
    url = f"{base}/v1/tts"
    model = (settings.fish_audio_model or "s2.1-pro-free").strip()
    reference_id = (settings.fish_audio_reference_id or "").strip() or None
    timeout = float(settings.fish_audio_timeout_seconds or 45.0)

    # Interviewer cadence: clear, steady, slightly deliberate.
    body: dict[str, Any] = {
        "text": cleaned,
        "format": format if format in {"mp3", "wav", "opus"} else "mp3",
        "mp3_bitrate": 128,
        "normalize": True,
        "latency": "balanced",
        "temperature": 0.55,
        "top_p": 0.7,
        "prosody": {
            "speed": 0.98,
            "volume": 0,
            "normalize_loudness": True,
        },
        "condition_on_previous_chunks": True,
    }
    if reference_id:
        body["reference_id"] = reference_id

    headers = {
        "Authorization": f"Bearer {settings.fish_audio_api_key.strip()}",
        "Content-Type": "application/json",
        "model": model,
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        logger.warning("Fish Audio TTS timeout after %ss", timeout)
        raise RuntimeError("Fish Audio TTS timed out") from exc
    except httpx.HTTPError as exc:
        logger.warning("Fish Audio TTS network error: %s", exc)
        raise RuntimeError("Fish Audio TTS network error") from exc

    if response.status_code == 401:
        raise RuntimeError("Fish Audio authentication failed — check FISH_AUDIO_API_KEY")
    if response.status_code == 402:
        raise RuntimeError("Fish Audio billing required for this account")
    if response.status_code >= 400:
        detail = (response.text or "")[:240]
        logger.warning("Fish Audio TTS failed status=%s body=%s", response.status_code, detail)
        raise RuntimeError(f"Fish Audio TTS failed ({response.status_code})")

    audio = response.content or b""
    if len(audio) < 32:
        raise RuntimeError("Fish Audio returned empty audio")

    media_type = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "opus": "audio/opus",
    }.get(str(body["format"]), "audio/mpeg")
    return audio, media_type
