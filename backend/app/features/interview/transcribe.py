"""
Groq Whisper transcription for mock-interview answers.

Keeps filler words (um, uh, like, you know) so coaching can hear how the
candidate actually spoke. Caller falls back to browser SpeechRecognition.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

GROQ_STT_MODEL = "whisper-large-v3-turbo"
MAX_AUDIO_BYTES = 8 * 1024 * 1024
VERBATIM_PROMPT = (
    "This is a spoken mock job interview. Transcribe the candidate verbatim, "
    "including filler words such as um, uh, uhm, er, ah, like, you know, I mean, "
    "sort of, kind of, and false starts. Do not clean up, paraphrase, or omit fillers."
)


def groq_stt_configured(settings: Settings) -> bool:
    return bool(getattr(settings, "groq_configured", False))


def transcribe_audio(
    settings: Settings,
    audio_bytes: bytes,
    *,
    filename: str = "answer.webm",
    content_type: str = "audio/webm",
) -> str:
    """Return a verbatim transcript. Raises RuntimeError on provider failure."""
    payload = audio_bytes or b""
    if len(payload) < 32:
        raise ValueError("Audio is empty")
    if len(payload) > MAX_AUDIO_BYTES:
        raise ValueError("Audio is too large to transcribe")
    if not groq_stt_configured(settings):
        raise RuntimeError("Speech transcription is not configured")

    base = (settings.groq_base_url or "").rstrip("/")
    url = f"{base}/audio/transcriptions"
    timeout = float(getattr(settings, "groq_timeout_seconds", 45) or 45)
    headers: dict[str, str] = {}
    if settings.groq_api_key:
        headers["Authorization"] = f"Bearer {settings.groq_api_key.strip()}"

    files: dict[str, Any] = {
        "file": (filename or "answer.webm", payload, content_type or "application/octet-stream"),
    }
    data = {
        "model": GROQ_STT_MODEL,
        "language": "en",
        "temperature": "0",
        "response_format": "json",
        "prompt": VERBATIM_PROMPT,
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, files=files, data=data)
    except httpx.TimeoutException as exc:
        logger.warning("Groq Whisper timeout after %ss", timeout)
        raise RuntimeError("Speech transcription timed out") from exc
    except httpx.HTTPError as exc:
        logger.warning("Groq Whisper network error: %s", exc)
        raise RuntimeError("Speech transcription network error") from exc

    if response.status_code in {401, 403}:
        raise RuntimeError("Speech transcription authentication failed — check GROQ_API_KEY")
    if response.status_code == 429:
        raise RuntimeError("Speech transcription is rate limited. Try again in a moment.")
    if response.status_code >= 400:
        detail = (response.text or "")[:240]
        logger.warning("Groq Whisper failed status=%s body=%s", response.status_code, detail)
        raise RuntimeError(f"Speech transcription failed ({response.status_code})")

    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError("Speech transcription returned unreadable JSON") from exc
    text = str((body or {}).get("text") or "").strip()
    if not text:
        raise RuntimeError("Speech transcription returned empty text")
    return text
