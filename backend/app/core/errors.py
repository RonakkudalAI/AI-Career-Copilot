import logging
from dataclasses import dataclass
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from google.api_core.exceptions import ResourceExhausted

logger = logging.getLogger("career_copilot.api")


@dataclass
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    details: Any = None


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    if isinstance(exc, ResourceExhausted):
        logger.warning(
            "dependency_quota_exhausted request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "firestore_quota_exhausted",
                    "message": "Firestore daily read quota is exhausted. Enable billing or wait for the quota reset, then retry.",
                    "details": None,
                    "request_id": request_id,
                }
            },
        )
    logger.exception(
        "unhandled_error request_id=%s method=%s path=%s type=%s",
        request_id,
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred.",
                "details": None,
                "request_id": request_id,
            }
        },
    )
