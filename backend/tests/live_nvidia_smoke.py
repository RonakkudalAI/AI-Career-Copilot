"""Explicit opt-in NVIDIA structured-output smoke test. Never runs in normal pytest."""

import asyncio
import os

from app.config import get_settings
from app.nvidia_client import NvidiaClient


async def main() -> None:
    if os.getenv("RUN_NVIDIA_LIVE_TESTS") != "1":
        raise SystemExit("Set RUN_NVIDIA_LIVE_TESTS=1 to explicitly enable this external-provider test.")
    settings = get_settings()
    result = await NvidiaClient(settings).generate(
        {
            "selected_blocks": [
                {
                    "block_id": "summary-1",
                    "section_key": "summary",
                    "text": "Backend engineer building reliable APIs.",
                    "source_hash": "smoke-fixture",
                }
            ],
            "verified_facts": [],
            "job_description": None,
            "ats_evidence": [],
        }
    )
    print(f"nvidia_live_structured_response=pass suggestions={len(result.suggestions)}")


if __name__ == "__main__":
    asyncio.run(main())
