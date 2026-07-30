from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import Depends, Header

from app.config import Settings, get_settings
from app.errors import ApiError


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None
    access_token: str


def parse_bearer_header(value: str | None) -> str:
    if not value:
        raise ApiError(401, "authentication_required", "Authentication is required.")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "invalid_authorization", "A valid Bearer token is required.")
    return token.strip()


async def get_current_user(
    authorization: str | None = Header(default=None), settings: Settings = Depends(get_settings)
) -> CurrentUser:
    if not settings.supabase_configured:
        raise ApiError(503, "supabase_not_configured", "Supabase is not configured on the API server.")
    token = parse_bearer_header(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise ApiError(
            503, "authentication_dependency_unavailable", "Authentication is temporarily unavailable."
        ) from exc
    if response.status_code != 200:
        raise ApiError(401, "invalid_access_token", "The authentication session is invalid or expired.")
    payload = response.json()
    try:
        user_id = UUID(payload["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ApiError(401, "invalid_user_identity", "The authentication identity is invalid.") from exc
    return CurrentUser(id=user_id, email=payload.get("email"), access_token=token)
