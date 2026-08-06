from __future__ import annotations

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
@lru_cache(maxsize=32)
def load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Agent prompt not found: {filename}")
    return path.read_text(encoding="utf-8").strip()
def load_prompt_or(filename: str, fallback: str) -> str:
    try:
        return load_prompt(filename)
    except OSError:
        return fallback.strip()
