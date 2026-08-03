"""Compatibility shim — prefer `from app.agents.providers import NvidiaClient`."""

from app.agents.providers.nvidia_client import NvidiaClient, PROMPTS_DIR, TRANSIENT_STATUS

__all__ = ["NvidiaClient", "PROMPTS_DIR", "TRANSIENT_STATUS"]
