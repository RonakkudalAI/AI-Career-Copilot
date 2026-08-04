from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Cookie, Depends, Header

from app.core.config import Settings, get_settings
from app.core.constants import JWT_ALGORITHM
from app.core.errors import ApiError
from app.database.client import database_client

# Cookie name must match frontend SESSION_COOKIE_NAME.
SESSION_COOKIE_NAME = "career_copilot_session"


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None
    access_token: str
    full_name: str | None = None


def parse_bearer_header(value: str | None) -> str:
    if not value:
        raise ApiError(401, "authentication_required", "Authentication is required.")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "invalid_authorization", "A valid Bearer token is required.")
    return token.strip()


def create_access_token(user_id: UUID, email: str, settings: Settings) -> str:
    return jwt.encode({"sub": str(user_id), "email": email}, settings.auth_secret, algorithm=JWT_ALGORITHM)


def _user_from_token(token: str, settings: Settings) -> CurrentUser:
    try:
        payload = jwt.decode(token, settings.auth_secret, algorithms=[JWT_ALGORITHM])
        user_id = UUID(str(payload["sub"]))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise ApiError(401, "invalid_access_token", "The authentication session is invalid or expired.") from exc
    rows = database_client(settings).table("users").select("id,email,full_name").eq("id", str(user_id)).limit(1).execute().data
    if not rows:
        raise ApiError(401, "invalid_user_identity", "The authentication identity is invalid.")
    row = rows[0]
    return CurrentUser(id=user_id, email=row.get("email"), access_token=token, full_name=row.get("full_name"))


async def get_current_user(
    authorization: str | None = Header(default=None),
    # FastAPI binds this parameter name as the cookie name (must equal SESSION_COOKIE_NAME).
    career_copilot_session: str | None = Cookie(default=None),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    token = parse_bearer_header(authorization) if authorization else career_copilot_session
    if not token:
        raise ApiError(401, "authentication_required", "Authentication is required.")
    return _user_from_token(token, settings)
