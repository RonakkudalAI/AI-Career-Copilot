"""Fish Audio TTS helpers — no network calls in unit tests."""

from types import SimpleNamespace

import pytest

from app.features.interview.tts import MAX_TTS_CHARS, fish_audio_configured, synthesize_speech


def _settings(**overrides):
    base = {
        "fish_audio_api_key": "",
        "fish_audio_base_url": "https://api.fish.audio",
        "fish_audio_model": "s2.1-pro-free",
        "fish_audio_reference_id": "bf322df2096a46f18c579d0baa36f41d",
        "fish_audio_timeout_seconds": 45.0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_fish_audio_configured_requires_key():
    assert fish_audio_configured(_settings(fish_audio_api_key="")) is False
    assert fish_audio_configured(_settings(fish_audio_api_key="  ")) is False
    assert fish_audio_configured(_settings(fish_audio_api_key="sk-test")) is True


def test_synthesize_rejects_empty_text():
    with pytest.raises(ValueError, match="required"):
        synthesize_speech(_settings(fish_audio_api_key="sk"), "   ")


def test_synthesize_requires_configuration():
    with pytest.raises(RuntimeError, match="not configured"):
        synthesize_speech(_settings(fish_audio_api_key=""), "Hello interviewer.")


def test_max_tts_chars_is_bounded():
    assert MAX_TTS_CHARS >= 200
    assert MAX_TTS_CHARS <= 2000
