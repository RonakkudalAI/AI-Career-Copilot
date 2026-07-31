"""Compatibility shim — prefer `from app.agents.llm import NvidiaClient`."""

from app.agents.llm.nvidia_client import NvidiaClient, PROMPTS_DIR, TRANSIENT_STATUS

__all__ = ["NvidiaClient", "PROMPTS_DIR", "TRANSIENT_STATUS"]
