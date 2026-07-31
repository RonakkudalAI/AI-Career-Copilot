"""Shared helpers for OpenAI-compatible LLM clients (NVIDIA, Groq)."""

from __future__ import annotations

import json
from typing import Any


def extract_message_content(body: dict[str, Any]) -> str:
    """Pull assistant text from a chat/completions response body."""
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        raise KeyError("choices")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise KeyError("message")
    content = message.get("content")
    if isinstance(content, str):
        return content
    # Some providers return content as a list of parts.
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text") or part.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    raise TypeError("content")


def strip_json_fence(content: str) -> str:
    """Remove optional ``` / ```json wrappers around model JSON."""
    text = (content or "").strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def parse_json_object(content: str) -> Any:
    """Parse JSON object/array from model text after fence stripping."""
    cleaned = strip_json_fence(content)
    if not cleaned or len(cleaned) > 200_000:
        raise json.JSONDecodeError("Empty or oversized provider output", cleaned or "", 0)
    return json.loads(cleaned)


def provider_error_detail(response_text: str, *, limit: int = 240) -> str:
    """Short non-secret detail from a provider error body for API messages."""
    text = (response_text or "").strip().replace("\n", " ")
    if not text:
        return ""
    return text[:limit]
