from __future__ import annotations

import logging

from pydantic import ValidationError

from app.agents.ats_scoring.crew import run_pipeline
from app.ats.scoring.schemas import ScoreRequest, ScoreResult
from app.core.errors import ApiError

logger = logging.getLogger(__name__)


async def score_resume_jd(
    resume_text: str,
    jd_text: str,
    *,
    provider: str | None = None,
) -> ScoreResult:
    """Validate and score resume/JD text without persisting the result."""
    try:
        request = ScoreRequest(resume_text=resume_text, jd_text=jd_text)
    except ValidationError as exc:
        raise ApiError(400, "invalid_ats_input", "Resume and job description text are required.", exc.errors()) from exc

    try:
        result = await run_pipeline(request.resume_text, request.jd_text, provider)
    except ApiError:
        raise
    except (RuntimeError, TimeoutError) as exc:
        logger.warning("ats_scoring_provider_unavailable error=%s", type(exc).__name__)
        raise ApiError(503, "ats_scoring_unavailable", "The ATS scoring provider is not available.") from exc
    except (ValidationError, ValueError, TypeError, KeyError) as exc:
        logger.exception("ats_scoring_structured_output_failed")
        raise ApiError(502, "ats_scoring_invalid_output", "The ATS scoring pipeline returned invalid structured data.") from exc
    except Exception as exc:
        logger.exception("ats_scoring_failed")
        raise ApiError(500, "ats_scoring_failed", "The ATS scoring pipeline could not complete.") from exc

    logger.info("ats_scoring_service_complete decision=%s score=%.2f", result.gate.decision, result.composite_score)
    return result
