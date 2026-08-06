from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest

from app.core.constants import JWT_ALGORITHM
from app.core.errors import ApiError
from app.features.auth.service import _user_from_token, create_access_token


class _Settings:
    auth_secret = "test-secret-for-jwt-repair-suite-32chars"
    jwt_ttl_seconds = 120
    firebase_project_id = ""
    firebase_credentials_path = ""


def test_create_access_token_includes_iat_and_exp():
    settings = _Settings()
    user_id = uuid4()
    token = create_access_token(user_id, "user@example.com", settings)  # type: ignore[arg-type]
    payload = jwt.decode(token, settings.auth_secret, algorithms=[JWT_ALGORITHM])
    assert payload["sub"] == str(user_id)
    assert payload["email"] == "user@example.com"
    assert "iat" in payload
    assert "exp" in payload
    assert payload["exp"] > payload["iat"]


def test_expired_token_is_rejected(monkeypatch):
    settings = _Settings()
    user_id = uuid4()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "email": "user@example.com",
            "iat": int((now - timedelta(hours=2)).timestamp()),
            "exp": int((now - timedelta(hours=1)).timestamp()),
        },
        settings.auth_secret,
        algorithm=JWT_ALGORITHM,
    )
    with pytest.raises(ApiError) as exc:
        _user_from_token(token, settings)  # type: ignore[arg-type]
    assert exc.value.code in {"token_expired", "invalid_access_token"}


def test_malformed_token_is_rejected():
    settings = _Settings()
    with pytest.raises(ApiError) as exc:
        _user_from_token("not-a-jwt", settings)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


def test_token_without_exp_is_rejected():
    settings = _Settings()
    token = jwt.encode(
        {"sub": str(uuid4()), "email": "user@example.com"},
        settings.auth_secret,
        algorithm=JWT_ALGORITHM,
    )
    with pytest.raises(ApiError) as exc:
        _user_from_token(token, settings)  # type: ignore[arg-type]
    assert exc.value.status_code == 401
