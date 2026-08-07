import hashlib
import hmac
import logging
import secrets
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Response
from app.core.config import Settings, get_settings
from app.core.constants import MIN_PASSWORD_LENGTH
from app.core.errors import ApiError
from app.database.client import database_client
from app.features.auth.service import CurrentUser, create_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Auth"])

def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _password_matches(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$", 2)
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(actual.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _auth_payload(user: dict[str, Any], settings: Settings) -> dict[str, Any]:
    token = create_access_token(UUID(str(user["id"])), str(user["email"]), settings)
    return {"access_token": token, "token_type": "bearer", "user": {"id": str(user["id"]), "email": user["email"], "full_name": user.get("full_name")}}


def _create_user_records(client, user: dict[str, Any]) -> dict[str, Any]:
    """Create the user graph with compensating cleanup if a child write fails."""
    user_id = str(user["id"])
    created_children: list[str] = []
    try:
        created = client.table("users").insert(user).execute().data or []
        if not created:
            raise RuntimeError("The users record was not created")
        for table, row in (
            ("profiles", {"id": user_id, "full_name": user.get("full_name") or ""}),
            ("candidate_preferences", {"user_id": user_id}),
            ("notification_preferences", {"user_id": user_id}),
            ("privacy_preferences", {"user_id": user_id}),
        ):
            created_children.append(table)
            client.table(table).insert(row).execute()
        return created[0]
    except Exception as exc:
        for table in reversed(created_children):
            try:
                key = "id" if table == "profiles" else "user_id"
                client.table(table).delete().eq(key, user_id).execute()
            except Exception:
                logger.exception("signup_rollback_failed table=%s user_id=%s", table, user_id)
        try:
            client.table("users").delete().eq("id", user_id).execute()
        except Exception:
            logger.exception("signup_rollback_failed table=users user_id=%s", user_id)
        raise ApiError(500, "account_creation_incomplete", "The account could not be created completely.") from exc


@router.post("/auth/sign-up", status_code=201)
def auth_sign_up(payload: dict[str, Any] = Body(...), settings: Settings = Depends(get_settings)):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    full_name = str(payload.get("full_name") or "").strip()[:120] or None
    if "@" not in email or len(password) < MIN_PASSWORD_LENGTH:
        raise ApiError(
            400,
            "invalid_signup",
            f"Enter a valid email and a password with at least {MIN_PASSWORD_LENGTH} characters.",
        )
    client = database_client(settings)
    if client.table("users").select("id").eq("email", email).limit(1).execute().data:
        raise ApiError(409, "user_already_exists", "An account with this email already exists.")
    user = _create_user_records(
        client,
        {"id": str(uuid.uuid4()), "email": email, "full_name": full_name, "password_hash": _password_hash(password)},
    )
    return _auth_payload(user, settings)


@router.post("/auth/sign-in")
def auth_sign_in(payload: dict[str, Any] = Body(...), settings: Settings = Depends(get_settings)):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    rows = database_client(settings).table("users").select("*").eq("email", email).limit(1).execute().data
    if not rows or not _password_matches(password, str(rows[0].get("password_hash") or "")):
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    return _auth_payload(rows[0], settings)


@router.post("/auth/session")
def auth_session(user: CurrentUser = Depends(get_current_user)):
    return {"user": {"id": str(user.id), "email": user.email, "full_name": user.full_name}}


@router.post("/auth/sign-out", status_code=204)
def auth_sign_out(response: Response):
    response.delete_cookie("career_copilot_session")


@router.post("/auth/firebase")
def auth_firebase(payload: dict[str, Any] = Body(...), settings: Settings = Depends(get_settings)):
    """Exchange a verified Firebase ID token for an app JWT."""
    from firebase_admin import auth as firebase_auth

    from app.database.client import firebase_admin_app

    id_token = str(payload.get("id_token") or "").strip()
    if not id_token:
        raise ApiError(400, "invalid_firebase_token", "A Firebase ID token is required.")
    try:
        admin_app = firebase_admin_app(settings)
        decoded = firebase_auth.verify_id_token(
            id_token,
            app=admin_app,
            check_revoked=settings.effective_firebase_check_revoked,
            clock_skew_seconds=getattr(settings, "firebase_clock_skew_seconds", 10),
        )
    except ApiError:
        raise
    except RuntimeError as exc:
        # Producer is misconfigured Admin/credentials — not an invalid user token.
        detail = str(exc)[:200]
        raise ApiError(
            503,
            "firebase_admin_unavailable",
            f"Firebase Admin is not available: {detail}",
        ) from exc
    except Exception as exc:
        detail = f"{type(exc).__name__}: {str(exc)[:120]}"
        raise ApiError(
            401,
            "invalid_firebase_token",
            f"The Firebase session is invalid or expired ({detail}).",
        ) from exc
    email = str(decoded.get("email") or "").strip().lower()
    uid = str(decoded.get("uid") or "").strip()
    if not uid:
        raise ApiError(401, "invalid_firebase_token", "Firebase identity is missing a UID.")
    if not email or "@" not in email:
        raise ApiError(401, "firebase_email_required", "A verified Firebase email is required.")
    if decoded.get("email_verified") is not True:
        raise ApiError(
            401,
            "firebase_email_unverified",
            "Verify your email with the identity provider before signing in.",
        )
    client = database_client(settings)
    rows = client.table("users").select("*").eq("email", email).limit(1).execute().data or []
    if rows:
        user = rows[0]
        existing_fb = str(user.get("firebase_uid") or "").strip()
        if existing_fb and existing_fb != uid:
            raise ApiError(
                409,
                "firebase_uid_conflict",
                "This email is already linked to a different identity provider account.",
            )
        if not existing_fb:
            # Refuse silent link when a local password account already owns this email.
            # Otherwise an attacker can sign-up with the victim's email, then the real
            # Google owner inherits (or shares) that attacker-owned account graph.
            if str(user.get("password_hash") or "").strip():
                raise ApiError(
                    409,
                    "account_exists_password",
                    "An account with this email already exists. Sign in with email and password.",
                )
            client.table("users").update({"firebase_uid": uid}).eq("id", str(user["id"])).execute()
            user["firebase_uid"] = uid
    else:
        user_id = str(uuid.uuid4())
        full_name = str(decoded.get("name") or "").strip()[:120] or None
        user = _create_user_records(
            client,
            {
                "id": user_id,
                "email": email,
                "full_name": full_name,
                "firebase_uid": uid,
                "password_hash": "",
            },
        )
    return _auth_payload(user, settings)


@router.post("/auth/resend")
def auth_resend():
    raise ApiError(
        503,
        "email_delivery_not_configured",
        "Email verification delivery is not configured. Sign in with the account credentials you created.",
    )


@router.post("/auth/reset-password")
def auth_reset_password():
    raise ApiError(
        503,
        "email_delivery_not_configured",
        "Password recovery email is not configured. Sign in and change your password from Account settings.",
    )


@router.post("/auth/update-password")
def auth_update_password(payload: dict[str, Any] = Body(...), user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    password = str(payload.get("password") or "")
    current_password = str(payload.get("current_password") or payload.get("old_password") or "")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ApiError(
            400,
            "invalid_password",
            f"Password must contain at least {MIN_PASSWORD_LENGTH} characters.",
        )
    client = database_client(settings)
    rows = client.table("users").select("id,password_hash").eq("id", str(user.id)).limit(1).execute().data or []
    if not rows:
        raise ApiError(401, "invalid_user_identity", "The authentication identity is invalid.")
    stored_hash = str(rows[0].get("password_hash") or "")
    # Password accounts must prove knowledge of the current password before rotation
    # (stolen JWT alone must not lock out the owner). Firebase-only accounts (empty
    # hash) may set a password without a prior local password.
    if stored_hash:
        if not current_password or not _password_matches(current_password, stored_hash):
            raise ApiError(
                401,
                "invalid_current_password",
                "Current password is incorrect.",
            )
    client.table("users").update({"password_hash": _password_hash(password)}).eq("id", str(user.id)).execute()
    return {"updated": True}
