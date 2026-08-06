import hashlib
import hmac
import logging
import mimetypes
import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, Header, Response, UploadFile
from fastapi.responses import Response as PlainResponse

from app.agents.registry import agents_status
from app.api.schemas import (
    AccountDeleteRequest,
    AtsAnalysisCreate,
    ExtractionPatch,
    InterviewCreate,
    InterviewPreparationCreate,
    InterviewResponseCreate,
    JobDescriptionMetadataPatch,
    JobDescriptionTextCreate,
    JobRecommendationGenerate,
    LearningItemProgressPatch,
    LearningPathCreate,
    LearningPathGenerate,
    NotificationSettings,
    PreferencesUpdate,
    PrivacySettings,
    ProfileFromResumeApplyRequest,
    ProfileFromResumePreviewRequest,
    ProfilePatch,
    SavedJobPatch,
)
from app.core.config import Settings, get_settings
from app.core.constants import MIN_PASSWORD_LENGTH
from app.core.errors import ApiError
from app.database.client import database_client, database_probe
from app.database.repository import (
    CANDIDATE_TABLES,
    client_for,
    list_recent_activity,
    owned_row,
    owned_rows,
    recalculate_completion,
    write_activity,
)
from app.features.ats.agents import generate_ats_improvement_brief
from app.features.ats.ats_score import (
    ALGORITHM_VERSION,
    ats_source_fingerprint,
    evidence_match_status,
    score_resume,
)
from app.features.auth.account_deletion import (
    CONFIRM_PHRASE,
    collect_user_storage_paths,
    confirmation_is_valid,
    email_matches_account,
    purge_user_storage,
)
from app.features.auth.service import CurrentUser, create_access_token, get_current_user
from app.features.career_matching import (
    ALGORITHM_VERSION as CAREER_MATCH_ALGORITHM_VERSION,
)
from app.features.career_matching import (
    _infer_work_mode,
    candidate_skill_evidence,
    progress_percentage,
    score_job,
)
from app.features.document_parsing.pipeline import parse_document_bytes
from app.features.document_parsing.service import (
    extract_sections_enriched,
    extract_skill_candidates,
    infer_job_metadata,
    infer_resume_title,
    safe_filename,
    sha256_bytes,
    validate_document,
)
from app.features.interview.agent import generate_interview_questions
from app.features.interview.preparation import generate_interview_preparation
from app.features.learning.service import generate_learning_path_from_ats
from app.features.profile.agent import build_profile_draft_enriched, profile_draft_response_payload
from app.features.profile.agent.normalize import normalize_date_value
from app.features.profile.avatars import (
    attach_avatar_url,
    avatar_extension_for_mime,
    signed_avatar_url,
    validate_avatar_upload,
)
from app.features.profile.importer import insert_validated_batch
from app.features.resume_improvement.routes import router as resume_improvement_router

router = APIRouter()
router.include_router(resume_improvement_router)
logger = logging.getLogger(__name__)
SCORING_ALGORITHM_VERSION = ALGORITHM_VERSION


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
        "Email verification is not enabled. Sign in with the account credentials you created.",
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


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


async def _extract_resume_content(
    content: bytes, filename: str, declared_mime: str | None, settings: Settings
) -> tuple[str, dict[str, Any]]:
    """Parse resume with pypdf (and optional fast PDF backends) + section map (no source-block payload)."""
    mime = validate_document(filename or "document", declared_mime, content, settings.document_max_bytes)
    return await parse_document_bytes(content, mime_type=mime, settings=settings)


def ensure_preference_row(client, table: str, user_id: str) -> dict[str, Any]:
    """Return a candidate preference row, repairing legacy users missing defaults."""
    rows = (
        client.table(table)
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    created = client.table(table).upsert({"user_id": user_id}).execute().data or []
    if not created:
        raise ApiError(500, "preferences_unavailable", "Candidate preferences could not be loaded.")
    return created[0]


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    status = agents_status(settings)
    probe = database_probe(settings)
    return {
        "status": "ok" if probe["status"] == "reachable" else "degraded",
        "service": settings.app_name,
        "database_engine": "firestore",
        "storage_engine": probe.get("storage_engine")
        or ("supabase_storage" if settings.supabase_storage_configured else "unconfigured"),
        "database_configured": settings.database_configured,
        "storage_configured": settings.storage_configured,
        "firebase_project_id": settings.firebase_project_id or None,
        "nvidia_configured": settings.nvidia_configured,
        "groq_configured": settings.groq_configured,
        "agent_count": status["agent_count"],
        "agents_ready": status["ready_count"],
        "llm_agents_configured": status["llm_configured_agent_count"],
        "database_status": probe["database_status"],
        "storage_status": probe["storage_status"],
    }


@router.get("/agents/status")
def agent_status(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Public agent inventory + configuration readiness (no secrets)."""
    return agents_status(settings)


@router.get("/health/database")
def health_database(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return database_probe(settings)


@router.get("/files/{bucket}/{path:path}")
def authenticated_file(
    bucket: str,
    path: str,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Stream a user-owned object from Firebase Storage after JWT ownership checks."""
    allowed = {settings.document_bucket, settings.avatar_bucket}
    if bucket not in allowed or not path.startswith(f"{user.id}/"):
        raise ApiError(404, "file_not_found", "The requested file was not found.")
    try:
        content = database_client(settings).storage.from_(bucket).download(path)
    except FileNotFoundError as exc:
        raise ApiError(404, "file_not_found", "The requested file was not found.") from exc
    except Exception as exc:
        raise ApiError(503, "storage_unavailable", "Firebase Storage is temporarily unavailable.") from exc
    media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return PlainResponse(content=content, media_type=media_type)


@router.get("/me/bootstrap")
def bootstrap(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
) -> dict[str, Any]:
    client = client_for(settings, user)
    # Bootstrap is a read endpoint. Completion is recalculated after mutations;
    # never perform cleanup or writes while loading a page.
    uid = str(user.id)

    def _read_profile():
        return client.table("profiles").select("*").eq("id", uid).limit(1).execute()

    def _read_active_resume():
        return (
            client.table("resumes")
            .select("id,title")
            .eq("user_id", uid)
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )

    def _read_confirmed_resume():
        return (
            client.table("resume_versions")
            .select("id", count="exact", head=True)
            .eq("user_id", uid)
            .eq("extraction_status", "confirmed")
            .execute()
        )

    def _read_latest_jd():
        return (
            client.table("job_descriptions")
            .select("id,title,company,role_title")
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

    def _read_latest_analysis():
        return (
            client.table("ats_analyses")
            .select("id,overall_score,status,created_at")
            .eq("user_id", uid)
            .eq("status", "completed")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="bootstrap") as executor:
        futures = {
            "profile": executor.submit(_read_profile),
            "active_resume": executor.submit(_read_active_resume),
            "confirmed_resume": executor.submit(_read_confirmed_resume),
            "latest_jd": executor.submit(_read_latest_jd),
            "latest_analysis": executor.submit(_read_latest_analysis),
            "recent_activity": executor.submit(list_recent_activity, client, user),
            "latest_actions": executor.submit(_latest_actions, client, user),
        }
        profile = (futures["profile"].result().data or [{}])[0]
        active_resume = futures["active_resume"].result().data or []
        confirmed_resume = futures["confirmed_resume"].result()
        latest_jd = futures["latest_jd"].result().data or []
        latest_analysis = futures["latest_analysis"].result().data or []
        recent_activity = futures["recent_activity"].result()
        latest_actions = futures["latest_actions"].result()
    def _count(table: str, *, deleted_only: bool = False, failed_only: bool = False) -> int:
        query = client.table(table).select("*", count="exact", head=True).eq("user_id", uid)
        if deleted_only:
            query = query.is_("deleted_at", "null")
        if failed_only:
            query = query.eq("status", "failed")
        return query.execute().count or 0

    count_jobs = {
        "resumes": ("resumes", True, False),
        "ats_analyses": ("ats_analyses", False, False),
        "interviews": ("interview_sessions", False, False),
        "learning_paths": ("learning_paths", False, False),
        "saved_jobs": ("saved_jobs", False, False),
        "failed_ats": ("ats_analyses", False, True),
    }
    with ThreadPoolExecutor(max_workers=len(count_jobs), thread_name_prefix="bootstrap-count") as executor:
        count_futures = {
            key: executor.submit(_count, table, deleted_only=deleted_only, failed_only=failed_only)
            for key, (table, deleted_only, failed_only) in count_jobs.items()
        }
        counts = {key: count_futures[key].result() for key in ("resumes", "ats_analyses", "interviews", "learning_paths", "saved_jobs")}
        failed_ats = count_futures["failed_ats"].result()
    return {
        "profile": attach_avatar_url(profile, client, settings),
        "active_resume": active_resume[0] if active_resume else None,
        "active_job_description": latest_jd[0] if latest_jd else None,
        "latest_ats_analysis": latest_analysis[0] if latest_analysis else None,
        "latest_actions": latest_actions,
        "counts": counts,
        "recent_activity": recent_activity,
        "workspace": {
            "profile_completion": max(
                0, min(100, int(profile.get("profile_completion") or 0))
            ),
            "profile_completion_details": profile.get("profile_completion_details") or {},
            # Server checklist only — never include retired criteria (e.g. old "resume" weight).
            "profile_missing": [
                item
                for item in (
                    (profile.get("profile_completion_details") or {}).get("missing") or []
                )
                if isinstance(item, dict)
                and item.get("key")
                and item.get("label")
                and str(item.get("key")) != "resume"
            ],
            "has_active_resume": bool(active_resume),
            "has_confirmed_resume": bool(confirmed_resume.count),
            "failed_ats_count": failed_ats,
            "ready_for_ats": bool(confirmed_resume.count) and bool(latest_jd),
        },
        "capabilities": {
            "ats_scoring": True,
            "interview_evaluation": False,
            "interview_questions": True,  # Groq when configured; templates otherwise
            "interview_questions_ai": settings.groq_configured,
            "resume_improvements": settings.nvidia_configured or settings.groq_configured,
            "profile_fill_ai": settings.nvidia_configured or settings.groq_configured,
            "ats_improvement_brief_ai": settings.nvidia_configured or settings.groq_configured,
            "job_recommendations": False,
            "nvidia_configured": settings.nvidia_configured,
            "groq_configured": settings.groq_configured,
        },
        "agents": agents_status(settings),
    }


def _latest_actions(client, user: CurrentUser) -> dict[str, Any]:
    """
    Build dashboard "latest progress" cards from real persisted rows.
    Uses existing tables only — simple queries (no nested joins) for reliability.
    """
    uid = str(user.id)
    last_resume_upload = None
    try:
        parents = (
            client.table("resumes")
            .select("id,title,deleted_at")
            .eq("user_id", uid)
            .is_("deleted_at", "null")
            .limit(50)
            .execute()
            .data
            or []
        )
        parent_by_id = {str(row.get("id")): row for row in parents}
        versions = (
            client.table("resume_versions")
            .select("id,resume_id,original_filename,created_at,source_type")
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .limit(12)
            .execute()
            .data
            or []
        )
        for row in versions:
            resume_id = row.get("resume_id")
            if not resume_id:
                continue
            parent = parent_by_id.get(str(resume_id), {})
            if parent.get("deleted_at"):
                continue
            last_resume_upload = {
                "version_id": row.get("id"),
                "resume_id": resume_id,
                "title": parent.get("title") or row.get("original_filename") or "Resume",
                "filename": row.get("original_filename"),
                "source_type": row.get("source_type"),
                "created_at": row.get("created_at"),
            }
            break
    except Exception:
        last_resume_upload = None

    last_interview = None
    try:
        completed = (
            client.table("interview_sessions")
            .select("id,mode,target_role,target_company,status,created_at,completed_at,started_at")
            .eq("user_id", uid)
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        rows = completed or (
            client.table("interview_sessions")
            .select("id,mode,target_role,target_company,status,created_at,completed_at,started_at")
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            row = rows[0]
            label_parts = [part for part in (row.get("target_role"), row.get("target_company")) if part]
            if not label_parts and row.get("mode"):
                label_parts = [str(row["mode"]).replace("_", " ").title()]
            last_interview = {
                "id": row.get("id"),
                "label": " · ".join(label_parts) if label_parts else "Mock interview",
                "mode": row.get("mode"),
                "status": row.get("status"),
                "created_at": row.get("created_at"),
                "at": row.get("completed_at") or row.get("started_at") or row.get("created_at"),
            }
    except Exception:
        last_interview = None

    last_job_applied = None
    try:
        applied = (
            client.table("saved_jobs")
            .select("job_id,status,saved_at,updated_at")
            .eq("user_id", uid)
            .eq("status", "applied")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        rows = applied or (
            client.table("saved_jobs")
            .select("job_id,status,saved_at,updated_at")
            .eq("user_id", uid)
            .order("saved_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            row = rows[0]
            job_id = row.get("job_id")
            title = "Saved job"
            company = None
            if job_id:
                jobs = (
                    client.table("jobs")
                    .select("id,title,company")
                    .eq("id", str(job_id))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if jobs:
                    title = jobs[0].get("title") or title
                    company = jobs[0].get("company")
            last_job_applied = {
                "job_id": job_id,
                "title": title,
                "company": company,
                "label": f"{title} · {company}" if company else title,
                "status": row.get("status"),
                "is_application": row.get("status") == "applied",
                "at": row.get("updated_at") if row.get("status") == "applied" else row.get("saved_at"),
            }
    except Exception:
        last_job_applied = None

    return {
        "last_resume_upload": last_resume_upload,
        "last_interview": last_interview,
        "last_job_applied": last_job_applied,
    }


@router.get("/me/activity")
def list_activity(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
) -> list[dict[str, Any]]:
    """Return the candidate's retained activity feed (max 5 newest rows)."""
    return list_recent_activity(client_for(settings, user), user)


def _normalize_token(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _prepare_candidate_payload(
    resource: str, payload: dict[str, Any], *, require_core: bool
) -> dict[str, Any]:
    data = {key: value for key, value in payload.items() if key not in {"user_id", "id"}}
    if resource == "skills":
        if "name" in data or require_core:
            name = str(data.get("name") or "").strip()
            if not name:
                raise ApiError(400, "invalid_skill", "Skill name is required.")
            data["name"] = name
            data["normalized_name"] = _normalize_token(str(data.get("normalized_name") or name))
    elif resource == "languages":
        if "language" in data or require_core:
            language = str(data.get("language") or "").strip()
            if not language:
                raise ApiError(400, "invalid_language", "Language is required.")
            data["language"] = language
            data["normalized_language"] = _normalize_token(str(data.get("normalized_language") or language))
    elif resource == "experiences" and require_core:
        if not str(data.get("company_name") or "").strip() or not str(data.get("role_title") or "").strip():
            raise ApiError(400, "invalid_experience", "Company name and role title are required.")
    if resource == "experiences":
        for key in ("start_date", "end_date"):
            if key in data and data[key] not in (None, ""):
                normalized = normalize_date_value(data[key])
                if normalized is None:
                    raise ApiError(400, "invalid_experience_date", "Experience dates must use YYYY-MM-DD format.")
                data[key] = normalized
        if data.get("is_current"):
            data["end_date"] = None
        if data.get("start_date") and data.get("end_date") and data["end_date"] < data["start_date"]:
            raise ApiError(400, "invalid_experience_date", "Experience end date cannot be before start date.")
    elif resource == "education" and require_core:
        if not str(data.get("institution") or "").strip():
            raise ApiError(400, "invalid_education", "Institution is required.")
    elif resource == "links":
        if require_core or "link_type" in data or "url" in data:
            link_type = str(data.get("link_type") or "").strip()
            url = str(data.get("url") or "").strip()
            if require_core and (
                link_type not in {"linkedin", "github", "portfolio", "website", "other"}
                or not url
            ):
                raise ApiError(400, "invalid_link", "A valid link type and URL are required.")
            if link_type:
                data["link_type"] = link_type
            if url:
                data["url"] = url
    if resource in {"experiences", "education", "projects", "languages", "links"}:
        data.setdefault("display_order", 0)
    return data


@router.get("/profile")
def get_profile(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    client = client_for(settings, user)
    profile = (
        client.table("profiles")
        .select("*")
        .eq("id", str(user.id))
        .limit(1)
        .execute()
        .data
        or [{}]
    )[0]
    return {
        "profile": attach_avatar_url(profile, client, settings),
        "preferences": ensure_preference_row(client, "candidate_preferences", str(user.id)),
    }


@router.patch("/profile")
def update_profile(
    payload: ProfilePatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    client.table("profiles").update(payload.model_dump(exclude_none=True)).eq("id", str(user.id)).execute()
    profile = recalculate_completion(client, user)
    write_activity(client, user, "profile_updated", "Candidate profile updated", "profile", str(user.id))
    return attach_avatar_url(profile, client, settings)


@router.post("/profile/avatar")
async def upload_profile_avatar(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Upload or replace the candidate profile picture.
    Max size: settings.avatar_max_bytes (3 MB). JPEG / PNG / WebP only.
    Stores path on profiles.avatar_path and returns a short-lived signed URL.
    """
    client = client_for(settings, user)
    raw = await file.read()
    mime = validate_avatar_upload(
        file.filename, file.content_type, raw, settings.avatar_max_bytes
    )
    ext = avatar_extension_for_mime(mime)
    new_path = f"{user.id}/avatars/{uuid.uuid4()}{ext}"

    current = (
        client.table("profiles")
        .select("avatar_path")
        .eq("id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    old_path = (current[0].get("avatar_path") if current else None) or None

    try:
        client.storage.from_(settings.avatar_bucket).upload(
            new_path,
            raw,
            {"content-type": mime, "upsert": "false"},
        )
    except Exception as exc:
        raise ApiError(500, "avatar_upload_failed", "The profile picture could not be stored.") from exc

    try:
        updated = (
            client.table("profiles")
            .update({"avatar_path": new_path})
            .eq("id", str(user.id))
            .execute()
            .data
        )
        if not updated:
            raise ApiError(
                500,
                "avatar_profile_update_failed",
                "The profile picture path could not be saved.",
            )
    except ApiError:
        try:
            client.storage.from_(settings.avatar_bucket).remove([new_path])
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            client.storage.from_(settings.avatar_bucket).remove([new_path])
        except Exception:
            pass
        raise ApiError(
            500,
            "avatar_profile_update_failed",
            "The profile picture path could not be saved.",
        ) from exc

    if old_path and old_path != new_path:
        try:
            client.storage.from_(settings.avatar_bucket).remove([old_path])
        except Exception:
            pass

    profile = recalculate_completion(client, user)
    write_activity(
        client, user, "avatar_updated", "Profile picture updated", "profile", str(user.id)
    )
    return {
        "profile": attach_avatar_url(profile, client, settings),
        "avatar_path": new_path,
        "avatar_url": signed_avatar_url(client, settings, new_path),
        "max_bytes": settings.avatar_max_bytes,
        "expires_in": settings.export_signed_url_seconds,
    }


@router.delete("/profile/avatar", status_code=204)
def delete_profile_avatar(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Remove the candidate profile picture from storage and clear profiles.avatar_path."""
    client = client_for(settings, user)
    rows = (
        client.table("profiles")
        .select("avatar_path")
        .eq("id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    path = (rows[0].get("avatar_path") if rows else None) or None
    client.table("profiles").update({"avatar_path": None}).eq("id", str(user.id)).execute()
    if path:
        try:
            client.storage.from_(settings.avatar_bucket).remove([path])
        except Exception:
            pass
    write_activity(
        client, user, "avatar_removed", "Profile picture removed", "profile", str(user.id)
    )


@router.put("/profile/preferences")
def update_preferences(
    payload: PreferencesUpdate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    result = client.table("candidate_preferences").upsert(
        {"user_id": str(user.id), **payload.model_dump()}
    ).execute().data or []
    if not result:
        raise ApiError(500, "preferences_save_failed", "Candidate preferences could not be saved.")
    recalculate_completion(client, user)
    write_activity(
        client, user, "profile_updated", "Candidate preferences updated", "preferences", str(user.id)
    )
    return result[0]


@router.post("/profile/skills/from-resume")
def import_skills_from_resume(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Import deterministic skill candidates from the candidate's confirmed resume text."""
    client = client_for(settings, user)
    versions = (
        client.table("resume_versions")
        .select("id,plain_text,structured_content")
        .eq("user_id", str(user.id))
        .eq("extraction_status", "confirmed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not versions:
        raise ApiError(404, "confirmed_resume_required", "Confirm a resume before importing skills.")
    version = versions[0]
    text_parts = [version.get("plain_text") or ""]
    sections = (version.get("structured_content") or {}).get("sections") or {}
    for lines in sections.values():
        if isinstance(lines, list):
            text_parts.extend(str(line) for line in lines)
    candidates = extract_skill_candidates("\n".join(text_parts))
    existing = {
        str(row.get("normalized_name") or "").lower()
        for row in owned_rows(client, "candidate_skills", user)
    }
    created: list[dict[str, Any]] = []
    for skill in candidates:
        normalized = _normalize_token(skill)
        if not normalized or normalized in existing:
            continue
        row = (
            client.table("candidate_skills")
            .insert(
                {
                    "user_id": str(user.id),
                    "name": skill,
                    "normalized_name": normalized,
                    "source": "resume_import",
                }
            )
            .execute()
            .data[0]
        )
        created.append(row)
        existing.add(normalized)
    profile = recalculate_completion(client, user)
    write_activity(
        client,
        user,
        "skills_imported",
        f"Imported {len(created)} skills from confirmed resume",
        "profile",
        str(user.id),
    )
    return {
        "suggested": candidates,
        "created": created,
        "created_count": len(created),
        "profile_completion": profile.get("profile_completion"),
    }


def _load_resume_version_for_profile_fill(
    client, user: CurrentUser, resume_version_id: UUID | str | None
) -> dict[str, Any]:
    """Load a candidate-owned **confirmed** resume version with extractable text."""
    if resume_version_id:
        rows = (
            client.table("resume_versions")
            .select("id,resume_id,plain_text,structured_content,extraction_status,original_filename,created_at")
            .eq("id", str(resume_version_id))
            .eq("user_id", str(user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise ApiError(404, "resume_version_not_found", "The selected resume version was not found.")
        version = rows[0]
        if version.get("extraction_status") != "confirmed":
            raise ApiError(
                409,
                "confirmed_resume_required",
                "Confirm the extracted resume before filling the profile from it.",
            )
    else:
        confirmed = (
            client.table("resume_versions")
            .select("id,resume_id,plain_text,structured_content,extraction_status,original_filename,created_at")
            .eq("user_id", str(user.id))
            .eq("extraction_status", "confirmed")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        version = confirmed[0] if confirmed else None
        if not version:
            raise ApiError(
                409,
                "confirmed_resume_required",
                "Confirm a resume extraction before filling the profile, or upload a PDF/DOCX on preview-upload.",
            )

    plain = (version.get("plain_text") or "").strip()
    if not plain:
        raise ApiError(
            422,
            "resume_has_no_text",
            "The selected resume has no extractable text. Re-upload a text-based PDF or DOCX.",
        )
    return version


@router.post("/profile/from-resume/preview")
async def preview_profile_from_resume(
    payload: ProfileFromResumePreviewRequest | None = Body(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Build a reviewable profile draft from a stored resume version.
    Uses NVIDIA structured extraction when configured, plus deterministic mapping.
    Does not write profile tables until /profile/from-resume/apply.
    """
    client = client_for(settings, user)
    version_id = payload.resume_version_id if payload else None
    version = _load_resume_version_for_profile_fill(client, user, version_id)
    plain_text = version.get("plain_text") or ""
    structured = version.get("structured_content") or {}
    if not isinstance(structured, dict) or not structured.get("sections"):
        structured = await extract_sections_enriched(plain_text, settings, prefer_llm=False)
    draft = await build_profile_draft_enriched(
        plain_text,
        structured if isinstance(structured, dict) else {},
        settings,
    )
    return profile_draft_response_payload(
        draft,
        {
            "id": version.get("id"),
            "resume_id": version.get("resume_id"),
            "original_filename": version.get("original_filename"),
            "extraction_status": version.get("extraction_status"),
            "source": "stored_version",
        },
    )


@router.post("/profile/from-resume/preview-upload")
async def preview_profile_from_resume_upload(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Build a reviewable profile draft from an uploaded PDF/DOCX.
    Uses NVIDIA structured extraction when configured, plus deterministic mapping.
    """
    raw = await file.read()
    mime = validate_document(
        file.filename or "resume.pdf", file.content_type, raw, settings.document_max_bytes
    )
    plain_text, structured = await _extract_resume_content(
        raw, file.filename or "resume", mime, settings
    )
    draft = await build_profile_draft_enriched(plain_text, structured, settings)
    return profile_draft_response_payload(
        draft,
        {
            "id": None,
            "original_filename": safe_filename(file.filename or "resume"),
            "source": "upload",
        },
    )


@router.post("/profile/from-resume/apply")
def apply_profile_from_resume(
    payload: ProfileFromResumeApplyRequest,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Persist a reviewed resume-derived draft into profiles + candidate_* tables.
    Default fill_empty_only=True avoids overwriting existing profile fields.
    """
    client = client_for(settings, user)
    uid = str(user.id)
    created: dict[str, int] = {
        "skills": 0,
        "experiences": 0,
        "education": 0,
        "projects": 0,
        "certifications": 0,
        "languages": 0,
        "links": 0,
    }
    updated_profile_fields: list[str] = []

    # --- profile core fields ---
    _profile_rows = client.table("profiles").select("*").eq("id", uid).single().execute().data or []
    current_profile = _profile_rows[0] if _profile_rows else {}
    profile_patch: dict[str, Any] = {}
    allowed = {
        "full_name",
        "headline",
        "bio",
        "phone",
        "location",
        "current_role",
        "years_experience",
        "career_level",
        "career_goal",
    }
    incoming = payload.profile or {}
    # Support draft shape { selected: true, full_name: ... }
    if incoming.get("selected") is False:
        incoming = {}
    for key in allowed:
        if key not in incoming:
            continue
        value = incoming.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value and key != "bio":
                continue
            if len(value) > 4000:
                value = value[:4000]
        if key == "years_experience":
            try:
                value = float(value)
            except (TypeError, ValueError):
                continue
            if value < 0 or value > 80:
                continue
        existing = current_profile.get(key)
        empty_existing = existing is None or (isinstance(existing, str) and not str(existing).strip())
        if payload.fill_empty_only and not empty_existing:
            continue
        profile_patch[key] = value
        updated_profile_fields.append(key)

    if profile_patch:
        client.table("profiles").update(profile_patch).eq("id", uid).execute()

    def _selected(row: dict[str, Any]) -> bool:
        return row.get("selected", True) is not False

    # --- skills ---
    existing_skills = {
        str(row.get("normalized_name") or "").lower()
        for row in owned_rows(client, "candidate_skills", user)
    }
    skill_rows: list[dict[str, Any]] = []
    for row in payload.skills or []:
        if not _selected(row):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        normalized = _normalize_token(str(row.get("normalized_name") or name))
        if not normalized or normalized in existing_skills:
            continue
        skill_rows.append(
            {
                "user_id": uid,
                "name": name[:120],
                "normalized_name": normalized,
                "source": str(row.get("source") or "resume_import")[:40],
            }
        )
        existing_skills.add(normalized)
    created["skills"] = insert_validated_batch(client, "candidate_skills", skill_rows)

    # --- experiences ---
    existing_exp = {
        (
            _normalize_token(str(row.get("company_name") or "")),
            _normalize_token(str(row.get("role_title") or "")),
        )
        for row in owned_rows(client, "candidate_experiences", user)
    }
    experience_rows: list[dict[str, Any]] = []
    for index, row in enumerate(payload.experiences or []):
        if not _selected(row):
            continue
        company = str(row.get("company_name") or "").strip()
        role = str(row.get("role_title") or "").strip()
        if not company or not role:
            continue
        key = (_normalize_token(company), _normalize_token(role))
        if key in existing_exp:
            continue
        experience_rows.append(
            {
                "user_id": uid,
                "company_name": company[:200],
                "role_title": role[:200],
                "location": (str(row["location"]).strip()[:160] if row.get("location") else None),
                "employment_type": (
                    str(row["employment_type"]).strip()[:80] if row.get("employment_type") else None
                ),
                "start_date": normalize_date_value(row.get("start_date")),
                "end_date": None if row.get("is_current") else normalize_date_value(row.get("end_date")),
                "summary": (str(row["summary"]).strip()[:4000] if row.get("summary") else None),
                "is_current": bool(row.get("is_current")),
                "display_order": int(row.get("display_order") or index),
            }
        )
        existing_exp.add(key)
    created["experiences"] = insert_validated_batch(client, "candidate_experiences", experience_rows)

    # --- education ---
    existing_edu = {
        (
            _normalize_token(str(row.get("institution") or "")),
            _normalize_token(str(row.get("degree") or "")),
        )
        for row in owned_rows(client, "candidate_education", user)
    }
    education_rows: list[dict[str, Any]] = []
    for index, row in enumerate(payload.education or []):
        if not _selected(row):
            continue
        institution = str(row.get("institution") or "").strip()
        if not institution:
            continue
        degree = str(row.get("degree") or "").strip() or None
        key = (_normalize_token(institution), _normalize_token(degree or ""))
        if key in existing_edu:
            continue
        education_rows.append(
            {
                "user_id": uid,
                "institution": institution[:200],
                "degree": degree[:160] if degree else None,
                "field_of_study": (
                    str(row["field_of_study"]).strip()[:160] if row.get("field_of_study") else None
                ),
                "grade": (str(row["grade"]).strip()[:80] if row.get("grade") else None),
                "description": (str(row["description"]).strip()[:2000] if row.get("description") else None),
                "display_order": int(row.get("display_order") or index),
            }
        )
        existing_edu.add(key)
    created["education"] = insert_validated_batch(client, "candidate_education", education_rows)

    # --- projects ---
    existing_projects = {
        _normalize_token(str(row.get("title") or ""))
        for row in owned_rows(client, "candidate_projects", user)
    }
    project_rows: list[dict[str, Any]] = []
    for index, row in enumerate(payload.projects or []):
        if not _selected(row):
            continue
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        key = _normalize_token(title)
        if key in existing_projects:
            continue
        project_rows.append(
            {
                "user_id": uid,
                "title": title[:200],
                "role": (str(row["role"]).strip()[:160] if row.get("role") else None),
                "description": (str(row["description"]).strip()[:4000] if row.get("description") else None),
                "skills": row.get("skills") if isinstance(row.get("skills"), list) else [],
                "display_order": int(row.get("display_order") or index),
            }
        )
        existing_projects.add(key)
    created["projects"] = insert_validated_batch(client, "candidate_projects", project_rows)

    # --- certifications ---
    existing_certs = {
        _normalize_token(str(row.get("name") or ""))
        for row in owned_rows(client, "candidate_certifications", user)
    }
    certification_rows: list[dict[str, Any]] = []
    for row in payload.certifications or []:
        if not _selected(row):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        key = _normalize_token(name)
        if key in existing_certs:
            continue
        certification_rows.append(
            {
                "user_id": uid,
                "name": name[:200],
                "issuer": (str(row["issuer"]).strip()[:160] if row.get("issuer") else None),
            }
        )
        existing_certs.add(key)
    created["certifications"] = insert_validated_batch(client, "candidate_certifications", certification_rows)

    # --- languages ---
    existing_langs = {
        str(row.get("normalized_language") or "").lower()
        for row in owned_rows(client, "candidate_languages", user)
    }
    language_rows: list[dict[str, Any]] = []
    for index, row in enumerate(payload.languages or []):
        if not _selected(row):
            continue
        language = str(row.get("language") or "").strip()
        if not language:
            continue
        normalized = _normalize_token(language)
        if not normalized or normalized in existing_langs:
            continue
        language_rows.append(
            {
                "user_id": uid,
                "language": language[:80],
                "normalized_language": normalized,
                "proficiency": (str(row["proficiency"]).strip()[:80] if row.get("proficiency") else None),
                "display_order": int(row.get("display_order") or index),
            }
        )
        existing_langs.add(normalized)
    created["languages"] = insert_validated_batch(client, "candidate_languages", language_rows)

    # --- links ---
    existing_links = {
        str(row.get("url") or "").strip().lower() for row in owned_rows(client, "candidate_links", user)
    }
    allowed_link_types = {"linkedin", "github", "portfolio", "website", "other"}
    link_rows: list[dict[str, Any]] = []
    for index, row in enumerate(payload.links or []):
        if not _selected(row):
            continue
        url = str(row.get("url") or "").strip()
        link_type = str(row.get("link_type") or "other").strip().lower()
        if not url or link_type not in allowed_link_types:
            continue
        if url.lower() in existing_links:
            continue
        link_rows.append(
            {
                "user_id": uid,
                "link_type": link_type,
                "url": url[:500],
                "label": (str(row["label"]).strip()[:120] if row.get("label") else None),
                "display_order": int(row.get("display_order") or index),
            }
        )
        existing_links.add(url.lower())
    created["links"] = insert_validated_batch(client, "candidate_links", link_rows)

    profile = recalculate_completion(client, user)
    write_activity(
        client,
        user,
        "profile_filled_from_resume",
        "Profile filled from resume draft",
        "profile",
        uid,
    )
    return {
        "profile": profile,
        "updated_profile_fields": updated_profile_fields,
        "created": created,
        "fill_empty_only": payload.fill_empty_only,
        "profile_completion": profile.get("profile_completion"),
    }


@router.get("/profile/{resource}")
def list_candidate_records(
    resource: str, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    table = CANDIDATE_TABLES.get(resource)
    if not table:
        raise ApiError(404, "resource_not_found", "The requested profile resource does not exist.")
    rows = owned_rows(client_for(settings, user), table, user)
    if resource not in {"skills", "certifications"}:
        # Sort after reading so legacy rows without display_order are not
        # silently excluded by Firestore's order_by behavior.
        rows.sort(key=lambda row: (row.get("display_order") is None, row.get("display_order") or 0))
    return rows


@router.post("/profile/{resource}", status_code=201)
def create_candidate_record(
    resource: str,
    payload: dict[str, Any] = Body(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    table = CANDIDATE_TABLES.get(resource)
    if not table:
        raise ApiError(404, "resource_not_found", "The requested profile resource does not exist.")
    if "user_id" in payload or "id" in payload:
        raise ApiError(400, "ownership_field_forbidden", "Ownership fields cannot be supplied.")
    client = client_for(settings, user)
    prepared = _prepare_candidate_payload(resource, payload, require_core=True)
    result = client.table(table).insert({**prepared, "user_id": str(user.id)}).execute().data[0]
    recalculate_completion(client, user)
    return result


@router.patch("/profile/{resource}/{record_id}")
def update_candidate_record(
    resource: str,
    record_id: UUID,
    payload: dict[str, Any] = Body(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    table = CANDIDATE_TABLES.get(resource)
    if not table:
        raise ApiError(404, "resource_not_found", "The requested profile resource does not exist.")
    client = client_for(settings, user)
    owned_row(client, table, record_id, user)
    prepared = _prepare_candidate_payload(resource, payload, require_core=False)
    result = (
        client.table(table)
        .update(prepared)
        .eq("id", str(record_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    recalculate_completion(client, user)
    return result


@router.delete("/profile/{resource}/{record_id}", status_code=204)
def delete_candidate_record(
    resource: str,
    record_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    table = CANDIDATE_TABLES.get(resource)
    if not table:
        raise ApiError(404, "resource_not_found", "The requested profile resource does not exist.")
    client = client_for(settings, user)
    owned_row(client, table, record_id, user)
    client.table(table).delete().eq("id", str(record_id)).eq("user_id", str(user.id)).execute()
    recalculate_completion(client, user)


async def _upload_resume_version(
    client, settings: Settings, user: CurrentUser, resume_id: str, file: UploadFile, content: bytes
) -> dict[str, Any]:
    mime = validate_document(
        file.filename or "document", file.content_type, content, settings.document_max_bytes
    )
    version_id = str(uuid.uuid4())
    suffix = ".pdf" if mime == "application/pdf" else ".docx"
    path = f"{user.id}/resumes/{resume_id}/{version_id}/{uuid.uuid4()}{suffix}"
    count = (
        client.table("resume_versions")
        .select("id", count="exact", head=True)
        .eq("resume_id", resume_id)
        .execute()
        .count
        or 0
    )
    try:
        client.storage.from_(settings.document_bucket).upload(
            path, content, {"content-type": mime, "upsert": "false"}
        )
        text, structured = await _extract_resume_content(
            content, file.filename or "document", mime, settings
        )
        record = {
            "id": version_id,
            "resume_id": resume_id,
            "user_id": str(user.id),
            "version_number": count + 1,
            "source_type": "uploaded",
            "original_filename": safe_filename(file.filename or "document"),
            "storage_path": path,
            "mime_type": mime,
            "size_bytes": len(content),
            "sha256": sha256_bytes(content),
            "plain_text": text,
            "structured_content": structured,
            "extraction_status": "review_required",
            "extraction_warnings": list(structured.get("warnings") or []),
        }
        return client.table("resume_versions").insert(record).execute().data[0]
    except ApiError:
        try:
            client.storage.from_(settings.document_bucket).remove([path])
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            client.storage.from_(settings.document_bucket).remove([path])
        except Exception:
            pass
        raise ApiError(500, "resume_upload_failed", "The resume could not be stored.") from exc


@router.get("/resumes")
def list_resumes(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    client = client_for(settings, user)
    rows = (
        client.table("resumes")
        .select("*")
        .eq("user_id", str(user.id))
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    version_rows = (
        client.table("resume_versions")
        .select("id,resume_id,version_number,original_filename,mime_type,extraction_status,created_at,size_bytes")
        .eq("user_id", str(user.id))
        .order("version_number", desc=True)
        .execute()
        .data
        or []
    )
    latest_by_resume: dict[str, dict[str, Any]] = {}
    for version in version_rows:
        latest_by_resume.setdefault(str(version.get("resume_id")), version)
    for row in rows:
        row["latest_version"] = latest_by_resume.get(str(row["id"]))
    return rows


@router.post("/resumes", status_code=201)
async def create_resume(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    resume_id = str(uuid.uuid4())
    profile_name = ""
    try:
        profile_rows = (
            client.table("profiles").select("full_name").eq("id", str(user.id)).single().execute().data or []
        )
        profile_row = profile_rows[0] if profile_rows else {}
        profile_name = str(profile_row.get("full_name") or "").strip()
    except Exception as exc:
        logger.warning("resume_create_profile_lookup_failed type=%s", type(exc).__name__)
        profile_name = ""
    if (title or "").strip():
        resume_title = title.strip()
    elif profile_name:
        resume_title = f"{profile_name} Resume"[:200]
    else:
        resume_title = infer_resume_title(file.filename)
    resume = (
        client.table("resumes")
        .insert(
            {
                "id": resume_id,
                "user_id": str(user.id),
                "title": resume_title,
                "is_active": not bool(
                    client.table("resumes")
                    .select("id")
                    .eq("user_id", str(user.id))
                    .is_("deleted_at", "null")
                    .limit(1)
                    .execute()
                    .data
                    or []
                ),
            }
        )
        .execute()
        .data[0]
    )
    try:
        content = await file.read()
        version = await _upload_resume_version(client, settings, user, resume_id, file, content)
    except Exception:
        client.table("resumes").delete().eq("id", resume_id).eq("user_id", str(user.id)).execute()
        raise
    write_activity(client, user, "resume_uploaded", "Resume uploaded", "resume", resume_id)
    return {"resume": resume, "version": version}


@router.get("/resumes/{resume_id}")
def get_resume(
    resume_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    resume = owned_row(client, "resumes", resume_id, user)
    resume["versions"] = (
        client.table("resume_versions")
        .select("*")
        .eq("resume_id", str(resume_id))
        .eq("user_id", str(user.id))
        .order("version_number", desc=True)
        .execute()
        .data
        or []
    )
    return resume


@router.patch("/resumes/{resume_id}")
def patch_resume(
    resume_id: UUID,
    payload: dict[str, Any] = Body(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "resumes", resume_id, user)
    allowed = {k: v for k, v in payload.items() if k in {"title"}}
    return (
        client.table("resumes")
        .update(allowed)
        .eq("id", str(resume_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


@router.delete("/resumes/{resume_id}", status_code=204)
def delete_resume(
    resume_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    owned_row(client, "resumes", resume_id, user)
    client.table("resumes").update({"deleted_at": utc_now(), "is_active": False}).eq("id", str(resume_id)).eq(
        "user_id", str(user.id)
    ).execute()
    recalculate_completion(client, user)
    write_activity(client, user, "resume_deleted", "Resume deleted", "resume", str(resume_id))


@router.get("/resumes/{resume_id}/preview")
def preview_resume(
    resume_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Return extracted resume text plus a short-lived signed URL for the original file."""
    client = client_for(settings, user)
    resume = owned_row(client, "resumes", resume_id, user)
    if resume.get("deleted_at"):
        raise ApiError(404, "record_not_found", "The requested record was not found.")
    versions = (
        client.table("resume_versions")
        .select(
            "id,version_number,original_filename,mime_type,extraction_status,created_at,"
            "plain_text,structured_content,storage_path,size_bytes,change_metadata"
        )
        .eq("resume_id", str(resume_id))
        .eq("user_id", str(user.id))
        .order("version_number", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not versions:
        raise ApiError(404, "resume_version_not_found", "No resume version is available to preview.")
    version = versions[0]
    download_url = None
    storage_path = version.get("storage_path")
    if storage_path:
        try:
            response = client.storage.from_(settings.document_bucket).create_signed_url(
                storage_path, settings.export_signed_url_seconds
            )
            download_url = response.get("signedURL") or response.get("signed_url")
        except Exception:
            download_url = None
    change_meta = version.get("change_metadata") if isinstance(version.get("change_metadata"), dict) else {}
    content_edited = bool(change_meta.get("in_place_edit") or change_meta.get("content_edited_at"))
    return {
        "resume": {
            "id": resume.get("id"),
            "title": resume.get("title"),
            "is_active": resume.get("is_active"),
            "created_at": resume.get("created_at"),
        },
        "version": {
            "id": version.get("id"),
            "version_number": version.get("version_number"),
            "original_filename": version.get("original_filename"),
            "mime_type": version.get("mime_type"),
            "extraction_status": version.get("extraction_status"),
            "created_at": version.get("created_at"),
            "size_bytes": version.get("size_bytes"),
            "plain_text": version.get("plain_text") or "",
            "structured_content": version.get("structured_content") or {},
            "change_metadata": change_meta,
            "content_edited": content_edited,
        },
        "download_url": download_url,
        "expires_in": settings.export_signed_url_seconds if download_url else 0,
        # Prefer regenerated PDF when the existing resume was patched after upload.
        "prefer_rendered_pdf": content_edited,
    }


@router.post("/resumes/{resume_id}/activate")
def activate_resume(
    resume_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    resume = owned_row(client, "resumes", resume_id, user)
    if resume.get("deleted_at"):
        raise ApiError(409, "resume_deleted", "A deleted resume cannot be activated. Restore is not supported; upload a new resume.")
    client.table("resumes").update({"is_active": False}).eq("user_id", str(user.id)).execute()
    result = (
        client.table("resumes")
        .update({"is_active": True})
        .eq("id", str(resume_id))
        .eq("user_id", str(user.id))
        .is_("deleted_at", "null")
        .execute()
        .data[0]
    )
    write_activity(client, user, "resume_activated", "Active resume changed", "resume", str(resume_id))
    return result


@router.post("/resumes/{resume_id}/versions", status_code=201)
async def create_resume_version(
    resume_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    resume = owned_row(client, "resumes", resume_id, user)
    if resume.get("deleted_at"):
        raise ApiError(409, "resume_deleted", "Cannot upload a new version to a deleted resume.")
    content = await file.read()
    return await _upload_resume_version(client, settings, user, str(resume_id), file, content)


@router.get("/resume-versions/{version_id}")
def get_resume_version(
    version_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return owned_row(client_for(settings, user), "resume_versions", version_id, user)


@router.patch("/resume-versions/{version_id}/extraction")
def patch_resume_extraction(
    version_id: UUID,
    payload: ExtractionPatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "resume_versions", version_id, user)
    return (
        client.table("resume_versions")
        .update({"structured_content": payload.structured_content, "extraction_status": "review_required"})
        .eq("id", str(version_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


@router.post("/resume-versions/{version_id}/confirm")
def confirm_resume_extraction(
    version_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "resume_versions", version_id, user)
    result = (
        client.table("resume_versions")
        .update({"extraction_status": "confirmed", "candidate_confirmed_at": utc_now()})
        .eq("id", str(version_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    recalculate_completion(client, user)
    write_activity(
        client,
        user,
        "resume_extraction_confirmed",
        "Resume extraction confirmed",
        "resume_version",
        str(version_id),
    )
    return result


@router.get("/job-descriptions")
def list_jds(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    return owned_rows(client_for(settings, user), "job_descriptions", user, "created_at")


@router.post("/job-descriptions", status_code=201)
async def create_jd(
    payload: JobDescriptionTextCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    # Text JD has no file bytes — section-parse the raw text only.
    from app.features.document_parsing.pipeline import _clean_structured

    raw_structured = await extract_sections_enriched(
        payload.raw_text,
        settings,
        schema_version="jd-extraction-v1",
        prefer_llm=False,
    )
    structured = _clean_structured(raw_structured, "jd-extraction-v1")
    inferred = infer_job_metadata(payload.raw_text)
    title = (payload.title or "").strip() or inferred["title"] or "Job description"
    role_title = (payload.role_title or "").strip() or inferred["role_title"]
    company = (payload.company or "").strip() or inferred["company"]
    record = {
        "title": title,
        "company": company,
        "role_title": role_title,
        "raw_text": payload.raw_text,
        "user_id": str(user.id),
        "input_type": "text",
        "structured_content": structured,
        "extraction_status": "review_required",
        "extraction_warnings": list(structured.get("warnings") or []),
    }
    result = client.table("job_descriptions").insert(record).execute().data[0]
    write_activity(
        client, user, "job_description_created", "Job description created", "job_description", result["id"]
    )
    return result


@router.post("/job-descriptions/upload", status_code=201)
async def upload_jd(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    company: str | None = Form(default=None),
    role_title: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    content = await file.read()
    mime = validate_document(
        file.filename or "document", file.content_type, content, settings.document_max_bytes
    )
    text, structured = await parse_document_bytes(
        content, mime_type=mime, settings=settings, schema_version="jd-extraction-v1"
    )
    inferred = infer_job_metadata(text)
    resolved_title = (title or "").strip() or inferred["title"] or infer_resume_title(file.filename)
    resolved_role = (role_title or "").strip() or inferred["role_title"]
    resolved_company = (company or "").strip() or inferred["company"]
    client = client_for(settings, user)
    jd_id = str(uuid.uuid4())
    suffix = ".pdf" if mime == "application/pdf" else ".docx"
    path = f"{user.id}/job-descriptions/{jd_id}/{uuid.uuid4()}{suffix}"
    try:
        client.storage.from_(settings.document_bucket).upload(
            path, content, {"content-type": mime, "upsert": "false"}
        )
        record = {
            "id": jd_id,
            "user_id": str(user.id),
            "title": resolved_title,
            "company": resolved_company,
            "role_title": resolved_role,
            "input_type": "pdf" if mime == "application/pdf" else "docx",
            "original_filename": safe_filename(file.filename or "document"),
            "storage_path": path,
            "mime_type": mime,
            "size_bytes": len(content),
            "sha256": sha256_bytes(content),
            "raw_text": text,
            "structured_content": structured,
            "extraction_status": "review_required",
            "extraction_warnings": list(structured.get("warnings") or []),
        }
        result = client.table("job_descriptions").insert(record).execute().data[0]
        write_activity(
            client, user, "job_description_created", "Job description uploaded", "job_description", jd_id
        )
        return result
    except Exception as exc:
        try:
            client.storage.from_(settings.document_bucket).remove([path])
        except Exception:
            pass
        if isinstance(exc, ApiError):
            raise
        raise ApiError(
            500, "job_description_upload_failed", "The job description could not be stored."
        ) from exc


@router.get("/job-descriptions/{jd_id}")
def get_jd(
    jd_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    return owned_row(client_for(settings, user), "job_descriptions", jd_id, user)


@router.patch("/job-descriptions/{jd_id}/metadata")
def patch_jd_metadata(
    jd_id: UUID,
    payload: JobDescriptionMetadataPatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Allow candidate override of auto-detected role/company/title."""
    client = client_for(settings, user)
    owned_row(client, "job_descriptions", jd_id, user)
    updates = {key: value for key, value in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise ApiError(400, "empty_metadata_patch", "Provide at least one metadata field to update.")
    if "role_title" in updates or "company" in updates:
        role = updates.get("role_title")
        company = updates.get("company")
        if role is None or company is None:
            current = owned_row(client, "job_descriptions", jd_id, user)
            role = role if role is not None else current.get("role_title")
            company = company if company is not None else current.get("company")
        if role and company:
            updates.setdefault("title", f"{role} · {company}"[:200])
        elif role:
            updates.setdefault("title", str(role)[:200])
    result = (
        client.table("job_descriptions")
        .update(updates)
        .eq("id", str(jd_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    write_activity(
        client,
        user,
        "job_description_updated",
        "Job description metadata updated",
        "job_description",
        str(jd_id),
    )
    return result


@router.patch("/job-descriptions/{jd_id}/extraction")
def patch_jd_extraction(
    jd_id: UUID,
    payload: ExtractionPatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "job_descriptions", jd_id, user)
    return (
        client.table("job_descriptions")
        .update({"structured_content": payload.structured_content, "extraction_status": "review_required"})
        .eq("id", str(jd_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


@router.post("/job-descriptions/{jd_id}/confirm")
def confirm_jd(
    jd_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    owned_row(client, "job_descriptions", jd_id, user)
    result = (
        client.table("job_descriptions")
        .update({"extraction_status": "confirmed", "candidate_confirmed_at": utc_now()})
        .eq("id", str(jd_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    write_activity(
        client,
        user,
        "job_description_confirmed",
        "Job description extraction confirmed",
        "job_description",
        str(jd_id),
    )
    return result


def _unavailable_resume_payload(
    *,
    resume_id: Any = None,
    title: str = "Resume unavailable",
    original_filename: Any = None,
    version_number: Any = None,
    created_at: Any = None,
) -> dict[str, Any]:
    return {
        "id": resume_id,
        "title": title,
        "original_filename": original_filename,
        "version_number": version_number,
        "created_at": created_at,
        "unavailable": True,
    }


def _unavailable_job_payload() -> dict[str, Any]:
    return {
        "id": None,
        "title": "Job description unavailable",
        "company": None,
        "role_title": None,
        "input_type": None,
        "original_filename": None,
        "created_at": None,
        "unavailable": True,
    }


def _enrich_ats_analysis(
    client, user: CurrentUser, analysis: dict[str, Any], *, include_parsed: bool = False
) -> dict[str, Any]:
    """Attach the resume version and job description used for a stored ATS run.

    Never raises for missing related rows: list history must stay visible even when
    a linked resume/JD was deleted or a legacy analysis row is incomplete.
    """
    enriched = dict(analysis or {})
    version_id = enriched.get("resume_version_id")
    job_id = enriched.get("job_description_id")

    # --- Resume used ---
    try:
        if not version_id:
            enriched["resume"] = _unavailable_resume_payload(title="Resume unavailable (no version linked)")
        else:
            version = owned_row(client, "resume_versions", version_id, user)
            resume_id = version.get("resume_id")
            version_meta = {
                "original_filename": version.get("original_filename"),
                "version_number": version.get("version_number"),
                "created_at": version.get("created_at"),
            }
            try:
                resume = owned_row(client, "resumes", resume_id, user) if resume_id else None
            except ApiError:
                resume = None
            if not resume:
                enriched["resume"] = _unavailable_resume_payload(
                    resume_id=resume_id,
                    title="Resume unavailable",
                    **version_meta,
                )
            elif resume.get("deleted_at"):
                enriched["resume"] = {
                    "id": resume.get("id"),
                    "title": resume.get("title") or "Deleted resume",
                    **version_meta,
                    "unavailable": True,
                }
            else:
                enriched["resume"] = {
                    "id": resume.get("id"),
                    "title": resume.get("title"),
                    **version_meta,
                    "unavailable": False,
                }
            if include_parsed:
                enriched["parsed_inputs"] = {
                    "resume": {
                        "filename": version.get("original_filename"),
                        "extraction_status": version.get("extraction_status"),
                        "plain_text": version.get("plain_text") or "",
                        "structured_content": version.get("structured_content") or {},
                    }
                }
    except Exception as exc:
        logger.warning(
            "ats_enrich_resume_failed analysis_id=%s type=%s",
            enriched.get("id"),
            type(exc).__name__,
        )
        enriched["resume"] = _unavailable_resume_payload()

    # --- Job description used ---
    try:
        if not job_id:
            enriched["job_description"] = {
                **_unavailable_job_payload(),
                "title": "Job description unavailable (none linked)",
            }
        else:
            job = owned_row(client, "job_descriptions", job_id, user)
            enriched["job_description"] = {
                "id": job.get("id"),
                "title": job.get("title"),
                "company": job.get("company"),
                "role_title": job.get("role_title"),
                "input_type": job.get("input_type"),
                "original_filename": job.get("original_filename"),
                "created_at": job.get("created_at"),
                "unavailable": False,
            }
            if include_parsed:
                enriched.setdefault("parsed_inputs", {})["job_description"] = {
                    "filename": job.get("original_filename"),
                    "extraction_status": job.get("extraction_status"),
                    "plain_text": job.get("raw_text") or "",
                    "structured_content": job.get("structured_content") or {},
                }
    except Exception as exc:
        logger.warning(
            "ats_enrich_job_failed analysis_id=%s type=%s",
            enriched.get("id"),
            type(exc).__name__,
        )
        enriched["job_description"] = _unavailable_job_payload()
    return enriched


@router.get("/ats-analyses")
def list_ats(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    client = client_for(settings, user)
    analyses = (
        client.table("ats_analyses")
        .select("*")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    # Keep every candidate-owned run visible; never drop the list on a single bad row.
    output: list[dict[str, Any]] = []
    for row in analyses:
        try:
            output.append(_enrich_ats_analysis(client, user, row))
        except Exception as exc:
            logger.exception(
                "ats_list_enrich_row_failed analysis_id=%s type=%s",
                (row or {}).get("id"),
                type(exc).__name__,
            )
            fallback = dict(row or {})
            fallback.setdefault("resume", _unavailable_resume_payload())
            fallback.setdefault("job_description", _unavailable_job_payload())
            output.append(fallback)
    return output


@router.get("/ats-analyses/{analysis_id}")
def get_ats(
    analysis_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    return _enrich_ats_analysis(
        client, user, owned_row(client, "ats_analyses", analysis_id, user), include_parsed=True
    )


@router.delete("/ats-analyses/{analysis_id}", status_code=204)
def delete_ats(
    analysis_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Delete a candidate-owned ATS analysis and related evidence."""
    client = client_for(settings, user)
    owned_row(client, "ats_analyses", analysis_id, user)
    try:
        client.table("resume_improvement_runs").update({"ats_analysis_id": None}).eq(
            "ats_analysis_id", str(analysis_id)
        ).eq("user_id", str(user.id)).execute()
        client.table("resume_suggestions").update({"analysis_id": None}).eq(
            "analysis_id", str(analysis_id)
        ).eq("user_id", str(user.id)).execute()
        client.table("ats_evidence").delete().eq("analysis_id", str(analysis_id)).eq(
            "user_id", str(user.id)
        ).execute()
        client.table("ats_analyses").delete().eq("id", str(analysis_id)).eq(
            "user_id", str(user.id)
        ).execute()
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(
            503,
            "ats_delete_failed",
            "Could not delete the ATS analysis and related rows. Retry the request.",
        ) from exc
    write_activity(
        client,
        user,
        "ats_analysis_deleted",
        "ATS analysis deleted",
        "ats_analysis",
        str(analysis_id),
    )


@router.post("/ats-analyses", status_code=201)
async def create_ats(
    payload: AtsAnalysisCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    version = owned_row(client, "resume_versions", payload.resume_version_id, user)
    job = owned_row(client, "job_descriptions", payload.job_description_id, user)
    if version.get("extraction_status") != "confirmed":
        raise ApiError(409, "resume_not_confirmed", "Confirm the extracted resume before scoring it.")
    if job.get("extraction_status") != "confirmed":
        raise ApiError(409, "job_description_not_confirmed", "Confirm the job description before scoring it.")

    structured = version.get("structured_content") or {}
    structured_sections = structured.get("sections") if isinstance(structured, dict) else None
    if not isinstance(structured_sections, dict):
        structured_sections = None

    # Fingerprint of the exact text used for scoring. Same version/job ids after
    # an in-place edit must re-score, not return a stale completed analysis.
    source_fp = ats_source_fingerprint(
        version.get("plain_text"),
        structured,
        job.get("raw_text"),
        resume_confirmed_at=str(version.get("candidate_confirmed_at") or ""),
        job_confirmed_at=str(job.get("candidate_confirmed_at") or ""),
    )

    existing = (
        client.table("ats_analyses")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("resume_version_id", str(payload.resume_version_id))
        .eq("job_description_id", str(payload.job_description_id))
        .eq("algorithm_version", SCORING_ALGORITHM_VERSION)
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        prior = existing[0]
        prior_breakdown = prior.get("score_breakdown") if isinstance(prior.get("score_breakdown"), dict) else {}
        prior_fp = prior_breakdown.get("source_fingerprint") if isinstance(prior_breakdown, dict) else None
        if prior_fp and prior_fp == source_fp:
            return _enrich_ats_analysis(client, user, prior, include_parsed=False)
        # Content changed under the same ids — fall through and re-score.

    try:
        score = score_resume(
            version.get("plain_text") or "",
            job.get("raw_text") or "",
            structured_sections=structured_sections,
        )
    except ValueError as exc:
        raise ApiError(422, "ats_input_insufficient", str(exc)) from exc

    # Single scoring path: deterministic keyword coverage only.
    # Source = JD requirement text. Evidence = exact resume quote or null.
    scoring_method = "Evidence-backed keyword coverage"
    persisted_score = score.overall_score
    score_breakdown = {
        **score.breakdown,
        "method": scoring_method,
        "source_fingerprint": source_fp,
    }
    missing_items = [
        {
            "term": item.requirement,
            "category": item.requirement_type,
            "priority": item.priority,
            "suggested_section": item.suggested_section,
            "match_strength": item.match_strength,
        }
        for item in score.evidence
        if not item.matched
    ]
    matched_items = [
        {
            "term": item.requirement,
            "evidence_line": item.resume_evidence,
            "section": item.resume_section,
            "match_strength": item.match_strength,
            "matched_alias": item.matched_alias,
        }
        for item in score.evidence
        if item.matched
    ]

    analysis = (
        client.table("ats_analyses")
        .insert(
            {
                "user_id": str(user.id),
                "resume_version_id": str(payload.resume_version_id),
                "job_description_id": str(payload.job_description_id),
                "status": "processing",
                "algorithm_version": SCORING_ALGORITHM_VERSION,
                "started_at": utc_now(),
            }
        )
        .execute()
        .data[0]
    )
    try:
        evidence_rows = [
            {
                "user_id": str(user.id),
                "analysis_id": analysis["id"],
                "category": "keyword_coverage",
                "requirement_text": item.requirement,
                "requirement_type": item.requirement_type,
                "resume_evidence_text": item.resume_evidence if item.matched else None,
                "resume_section": item.resume_section if item.matched else None,
                "resume_source_reference": {
                    "resume_version_id": str(payload.resume_version_id),
                    "quoted_line": item.resume_evidence if item.matched else None,
                    "section": item.resume_section if item.matched else None,
                    "matched_alias": item.matched_alias if item.matched else None,
                },
                "job_description_source_reference": {
                    "job_description_id": str(payload.job_description_id),
                    "requirement": item.requirement,
                    "requirement_type": item.requirement_type,
                },
                "match_status": evidence_match_status(item.match_strength),
                "score_contribution": item.score_contribution,
                "rule_id": "exact_resume_quote_match_v3",
                "explanation": item.explanation,
            }
            for item in score.evidence
        ]
        if evidence_rows:
            client.table("ats_evidence").insert(evidence_rows).execute()

        brief = await generate_ats_improvement_brief(
            settings,
            overall_score=persisted_score,
            missing_terms=score.missing_terms,
            matched_count=len(score.matched_terms),
            total_terms=len(score.evidence),
            role_title=job.get("role_title") or job.get("title"),
            company=job.get("company"),
            missing_items=missing_items,
            matched_items=matched_items,
            structured_parameter_scores=None,
            domain_gate=None,
            resume_section_summary=score.section_summary,
        )

        completed_rows = (
            client.table("ats_analyses")
            .update(
                {
                    "status": "completed",
                    "overall_score": persisted_score,
                    "score_breakdown": score_breakdown,
                    "summary": {
                        "method": scoring_method,
                        "matched": len(score.matched_terms),
                        "missing": len(score.missing_terms),
                        "total": len(score.evidence),
                        "missing_terms": score.missing_terms,
                        "partial_terms": score.partial_terms or [],
                        "critical_missing": [
                            item.requirement
                            for item in score.evidence
                            if item.priority == "critical" and not item.matched
                        ],
                        "preferred_missing": [
                            item.requirement
                            for item in score.evidence
                            if item.priority == "preferred" and not item.matched
                        ],
                        "required_score": score.required_score,
                        "preferred_score": score.preferred_score,
                        "section_summary": score.section_summary or {},
                        "overall_inference": brief.get("overall_inference"),
                        "focus_areas": brief.get("focus_areas") or [],
                        "priority_actions": brief.get("priority_actions") or [],
                        "section_guidance": brief.get("section_guidance") or [],
                        "do_not_claim": brief.get("do_not_claim") or [],
                        "inference_provider": brief.get("provider"),
                        "inference_model": brief.get("model"),
                        "disclaimer": (
                            "Score is keyword coverage only: each hit quotes an exact resume line. "
                            "Not a hiring prediction. Never add experience that is not in the resume."
                        ),
                    },
                    "completed_at": utc_now(),
                }
            )
            .eq("id", analysis["id"])
            .eq("user_id", str(user.id))
            .execute()
            .data
            or []
        )
        if not completed_rows:
            # Query-by-field miss after insert used to IndexError as a vague 500.
            raise RuntimeError(
                f"ats_analysis_update_returned_empty analysis_id={analysis.get('id')}"
            )
        completed = completed_rows[0]
    except Exception as exc:
        logger.exception(
            "ats_persistence_failed analysis_id=%s type=%s",
            analysis.get("id"),
            type(exc).__name__,
        )
        try:
            client.table("ats_analyses").update(
                {
                    "status": "failed",
                    "error_code": "ats_persistence_failed",
                    "error_message": "Scoring could not be persisted.",
                }
            ).eq("id", analysis["id"]).eq("user_id", str(user.id)).execute()
        except Exception:
            logger.exception(
                "ats_mark_failed_also_failed analysis_id=%s",
                analysis.get("id"),
            )
        raise ApiError(500, "ats_persistence_failed", "The ATS analysis could not be persisted.") from exc

    write_activity(
        client,
        user,
        "ats_analysis_completed",
        "ATS keyword coverage completed",
        "ats_analysis",
        completed["id"],
    )
    # Return the same shape as GET list/detail so the UI can show resume + JD used.
    return _enrich_ats_analysis(client, user, completed, include_parsed=False)


@router.get("/ats-analyses/{analysis_id}/evidence")
def list_ats_evidence(
    analysis_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "ats_analyses", analysis_id, user)
    return (
        client.table("ats_evidence")
        .select("*")
        .eq("analysis_id", str(analysis_id))
        .eq("user_id", str(user.id))
        .order("created_at")
        .execute()
        .data
        or []
    )


@router.get("/ats-analyses/{analysis_id}/suggestions")
def list_suggestions(
    analysis_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "ats_analyses", analysis_id, user)
    return (
        client.table("resume_suggestions")
        .select("*")
        .eq("analysis_id", str(analysis_id))
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )


@router.get("/interviews")
def list_interviews(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    return owned_rows(client_for(settings, user), "interview_sessions", user, "created_at")


@router.post("/interview-preparation")
async def create_interview_preparation(
    payload: InterviewPreparationCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Return a non-persistent preparation plan from confirmed candidate evidence."""
    return await generate_interview_preparation(
        client_for(settings, user),
        settings,
        user,
        resume_version_id=payload.resume_version_id,
        job_description_id=payload.job_description_id,
    )


@router.post("/interviews", status_code=201)
def create_interview(
    payload: InterviewCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    return (
        client.table("interview_sessions")
        .insert({**payload.model_dump(mode="json"), "user_id": str(user.id)})
        .execute()
        .data[0]
    )


@router.get("/interviews/{session_id}")
def get_interview(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    session = owned_row(client, "interview_sessions", session_id, user)
    questions = (
        client.table("interview_questions")
        .select("id,position,question,question_type,source_context,created_at")
        .eq("session_id", str(session_id))
        .eq("user_id", str(user.id))
        .order("position")
        .execute()
        .data
        or []
    )
    return {"session": session, "questions": questions}


@router.delete("/interviews/{session_id}", status_code=204)
def delete_interview(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Permanently delete a mock interview session for the signed-in candidate.
    Cascades to interview_questions, interview_responses, and interview_reports in DB.
    Also removes any interview media files referenced by responses.
    """
    client = client_for(settings, user)
    owned_row(client, "interview_sessions", session_id, user)

    # Media is no longer stored, so no storage cleanup is needed.
    # Firestore has no FK cascade — delete children first (same pattern as learning paths).
    sid = str(session_id)
    uid = str(user.id)
    client.table("interview_reports").delete().eq("session_id", sid).eq("user_id", uid).execute()
    client.table("interview_responses").delete().eq("session_id", sid).eq("user_id", uid).execute()
    client.table("interview_questions").delete().eq("session_id", sid).eq("user_id", uid).execute()
    client.table("interview_sessions").delete().eq("id", sid).eq("user_id", uid).execute()
    write_activity(
        client,
        user,
        "interview_deleted",
        "Mock interview session deleted",
        "interview_session",
        sid,
    )


@router.post("/interviews/{session_id}/start")
async def start_interview(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Start a session and generate practice questions via Groq (dedicated task).
    NVIDIA is not used here and is never a fallback for this path.
    """
    client = client_for(settings, user)
    session = owned_row(client, "interview_sessions", session_id, user)
    result = (
        client.table("interview_sessions")
        .update({"status": "in_progress", "started_at": utc_now()})
        .eq("id", str(session_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )

    existing = (
        client.table("interview_questions")
        .select("id")
        .eq("session_id", str(session_id))
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    questions_payload: dict[str, Any] = {"questions": [], "provider": None, "model": None}
    if not existing:
        count = int(session.get("question_count") or 3)
        questions_payload = await generate_interview_questions(
            settings,
            mode=str(session.get("mode") or "mixed"),
            count=count,
            target_role=session.get("target_role"),
            target_company=session.get("target_company"),
            difficulty=session.get("difficulty"),
            topic=session.get("topic"),
        )
        rows = []
        for index, item in enumerate(questions_payload.get("questions") or [], start=1):
            rows.append(
                {
                    "user_id": str(user.id),
                    "session_id": str(session_id),
                    "position": index,
                    "question": str(item.get("question") or "").strip()[:800],
                    "question_type": (item.get("question_type") or session.get("mode") or "mixed")[:80],
                    "source_context": {
                        "provider": questions_payload.get("provider"),
                        "model": questions_payload.get("model"),
                    },
                }
            )
        if rows:
            client.table("interview_questions").insert(rows).execute()

    questions = (
        client.table("interview_questions")
        .select("id,position,question,question_type,source_context,created_at")
        .eq("session_id", str(session_id))
        .eq("user_id", str(user.id))
        .order("position")
        .execute()
        .data
        or []
    )
    write_activity(
        client, user, "interview_started", "Interview session started", "interview_session", str(session_id)
    )
    return {
        "session": result,
        "questions": questions,
        "question_provider": questions_payload.get("provider"),
        "question_model": questions_payload.get("model"),
        "agent": questions_payload.get("agent") or "interview_questions",
        "fallback": bool(questions_payload.get("fallback")),
        "fallback_reason": questions_payload.get("fallback_reason"),
    }


@router.post("/interviews/{session_id}/responses", status_code=201)
def add_response(
    session_id: UUID,
    payload: InterviewResponseCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "interview_sessions", session_id, user)
    question = (
        client.table("interview_questions")
        .select("id")
        .eq("id", str(payload.question_id))
        .eq("session_id", str(session_id))
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not question:
        raise ApiError(404, "question_not_found", "The question does not belong to this interview session.")
    return (
        client.table("interview_responses")
        .insert({**payload.model_dump(mode="json"), "session_id": str(session_id), "user_id": str(user.id)})
        .execute()
        .data[0]
    )


@router.post("/interviews/{session_id}/complete")
def complete_interview(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "interview_sessions", session_id, user)
    result = (
        client.table("interview_sessions")
        .update({"status": "completed", "completed_at": utc_now()})
        .eq("id", str(session_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    write_activity(
        client,
        user,
        "interview_completed",
        "Interview session completed",
        "interview_session",
        str(session_id),
    )
    return {
        "session": result,
        "report": None,
        "message": "No evaluator is configured; no report was generated.",
    }


@router.get("/learning-paths")
def list_learning(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    return owned_rows(client_for(settings, user), "learning_paths", user, "created_at")


@router.get("/learning-paths/{path_id}")
def get_learning(
    path_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    path = owned_row(client, "learning_paths", path_id, user)
    items = (
        client.table("learning_items")
        .select("*")
        .eq("learning_path_id", str(path_id))
        .eq("user_id", str(user.id))
        .order("position")
        .execute()
        .data
        or []
    )
    item_ids = [str(item.get("id")) for item in items if item.get("id")]
    resources = []
    if item_ids:
        resources = (
            client.table("learning_resources")
            .select("*")
            .eq("user_id", str(user.id))
            .in_("learning_item_id", item_ids)
            .execute()
            .data
            or []
        )
    by_item: dict[str, list[dict[str, Any]]] = {}
    for resource in resources:
        key = str(resource.get("learning_item_id") or "")
        by_item.setdefault(key, []).append(resource)
    for item in items:
        item["learning_resources"] = by_item.get(str(item.get("id")), [])
    path["items"] = items
    return path


@router.delete("/learning-paths/{path_id}", status_code=204)
def delete_learning_path(
    path_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Delete a candidate-owned learning path and cascade items/resources."""
    client = client_for(settings, user)
    owned_row(client, "learning_paths", path_id, user)
    items = (
        client.table("learning_items")
        .select("id")
        .eq("learning_path_id", str(path_id))
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    item_ids = [str(item.get("id")) for item in items if item.get("id")]
    if item_ids:
        client.table("learning_resources").delete().eq("user_id", str(user.id)).in_(
            "learning_item_id", item_ids
        ).execute()
    client.table("learning_items").delete().eq("learning_path_id", str(path_id)).eq(
        "user_id", str(user.id)
    ).execute()
    client.table("learning_paths").delete().eq("id", str(path_id)).eq("user_id", str(user.id)).execute()
    write_activity(
        client,
        user,
        "learning_path_deleted",
        "Learning path deleted",
        "learning_path",
        str(path_id),
    )


@router.post("/learning-paths", status_code=201)
def create_learning(
    payload: LearningPathCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return (
        client_for(settings, user)
        .table("learning_paths")
        .insert({**payload.model_dump(), "user_id": str(user.id)})
        .execute()
        .data[0]
    )


@router.post("/learning-paths/generate", status_code=201)
async def generate_learning_path(
    payload: LearningPathGenerate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Create a YouTube-backed learning path from a completed ATS analysis only.

    Crew (sequential, CrewAI-compatible):
      1) ATS gap analyst (deterministic evidence extract)
      2) YouTube curriculum planner (Groq LLM or deterministic) — queries only
      3) Resource validator: YouTube Data API exact videos (no invented IDs)
    """
    client = client_for(settings, user)
    analyses = (
        client.table("ats_analyses")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if payload.source_analysis_id:
        analyses = (
            client.table("ats_analyses")
            .select("*")
            .eq("id", str(payload.source_analysis_id))
            .eq("user_id", str(user.id))
            .eq("status", "completed")
            .limit(1)
            .execute()
            .data
            or []
        )
    if not analyses:
        raise ApiError(409, "completed_ats_required", "Complete an ATS analysis before generating a learning path.")
    analysis = analyses[0]
    version = owned_row(client, "resume_versions", analysis["resume_version_id"], user)
    resume = owned_row(client, "resumes", version["resume_id"], user)
    # Optional role context from linked JD (never invents a role)
    role_title: str | None = None
    jd_id = analysis.get("job_description_id")
    if jd_id:
        try:
            jd = owned_row(client, "job_descriptions", jd_id, user)
            role_title = str(jd.get("role_title") or jd.get("title") or "").strip() or None
        except Exception:
            role_title = None
    evidence = (
        client.table("ats_evidence")
        .select("requirement_text,match_status,category,explanation")
        .eq("analysis_id", analysis["id"])
        .eq("user_id", str(user.id))
        .order("created_at")
        .execute()
        .data
        or []
    )
    generated = await generate_learning_path_from_ats(
        settings,
        evidence_rows=evidence,
        source_analysis_id=str(analysis["id"]),
        role_title=role_title,
    )
    items = list(generated.get("items") or [])
    crew_meta = generated.get("crew") if isinstance(generated.get("crew"), dict) else {}
    if crew_meta.get("success") is False:
        raise ApiError(
            502,
            "learning_path_generation_failed",
            str(crew_meta.get("message") or "Learning path generation failed. Check ATS evidence and YouTube API configuration."),
        )
    if not items:
        raise ApiError(
            422,
            "no_learning_gaps",
            "No missing or partial ATS requirements were available to build a YouTube learning path.",
        )
    algorithm_version = str(generated.get("algorithm_version") or CAREER_MATCH_ALGORITHM_VERSION)
    path = client.table("learning_paths").insert({
        "user_id": str(user.id),
        "title": f"YouTube learning path · {resume.get('title') or 'your resume'}",
        "description": (
            "Study plan from requirements not fully evidenced in your completed ATS analysis. "
            "Each step recommends exact YouTube videos from the YouTube API (or a search page if the API is unavailable). "
            "Open a video, learn, then mark the step complete — progress is saved to your account."
        ),
        "source_type": "ats_analysis",
        "source_id": str(analysis["id"]),
        "status": "active",
        "progress_percentage": 0,
    }).execute().data[0]
    stored_items = []
    for item in items:
        resources = item.pop("resources", [])
        # Ensure metadata remains a plain JSON-serializable mapping for Firestore.
        metadata = item.get("metadata")
        if isinstance(metadata, dict):
            item = {**item, "metadata": metadata}
        stored = client.table("learning_items").insert({
            **item,
            "user_id": str(user.id),
            "learning_path_id": path["id"],
            "status": "pending",
        }).execute().data[0]
        for resource in resources:
            client.table("learning_resources").insert({
                **resource,
                "user_id": str(user.id),
                "learning_item_id": stored["id"],
            }).execute()
        stored["learning_resources"] = (
            client.table("learning_resources")
            .select("*")
            .eq("learning_item_id", stored["id"])
            .eq("user_id", str(user.id))
            .execute()
            .data
            or []
        )
        stored_items.append(stored)
    return {
        **path,
        "items": stored_items,
        "algorithm_version": algorithm_version,
        "crew": generated.get("crew"),
        "grounding": {
            "source": "completed_ats_analysis",
            "analysis_id": str(analysis["id"]),
            "policy": "youtube_search_or_allowlist_only_no_invented_video_ids",
        },
    }


@router.patch("/learning-paths/{path_id}/items/{item_id}")
def update_learning_item(
    path_id: UUID,
    item_id: UUID,
    payload: LearningItemProgressPatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "learning_paths", path_id, user)
    item = (
        client.table("learning_items")
        .select("*")
        .eq("id", str(item_id))
        .eq("learning_path_id", str(path_id))
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not item:
        raise ApiError(404, "learning_item_not_found", "The learning item was not found.")
    updated = client.table("learning_items").update({
        "status": payload.status,
        "completed_at": utc_now() if payload.status == "completed" else None,
    }).eq("id", str(item_id)).eq("user_id", str(user.id)).execute().data[0]
    all_items = client.table("learning_items").select("status").eq("learning_path_id", str(path_id)).eq("user_id", str(user.id)).execute().data or []
    percentage = progress_percentage(all_items)
    client.table("learning_paths").update({
        "progress_percentage": percentage,
        "status": "completed" if percentage == 100 and all_items else "active",
        "updated_at": utc_now(),
    }).eq("id", str(path_id)).eq("user_id", str(user.id)).execute()
    return {**updated, "progress_percentage": percentage}


@router.get("/jobs")
def list_jobs(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    return (
        client_for(settings, user)
        .table("jobs")
        .select("*")
        .eq("is_active", True)
        .order("published_at", desc=True)
        .execute()
        .data
        or []
    )


_external_sync_lock = __import__("threading").Lock()
_external_sync_last: dict[str, float] = {}
_EXTERNAL_SYNC_COOLDOWN_SECONDS = 60.0


@router.post("/jobs/external/sync")
def sync_external_jobs(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    import time

    from app.features.adzuna_api import AdzunaClient

    now = time.monotonic()
    last = _external_sync_last.get(str(user.id), 0.0)
    if now - last < _EXTERNAL_SYNC_COOLDOWN_SECONDS:
        raise ApiError(
            429,
            "jobs_sync_cooldown",
            f"Wait {int(_EXTERNAL_SYNC_COOLDOWN_SECONDS - (now - last))}s before syncing external jobs again.",
        )
    if not _external_sync_lock.acquire(blocking=False):
        raise ApiError(429, "jobs_sync_busy", "An external job sync is already running. Try again shortly.")
    try:
        client = client_for(settings, user)
        prefs_rows = (
            client.table("candidate_preferences")
            .select("target_roles,preferred_locations")
            .eq("user_id", str(user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        prefs = prefs_rows[0] if prefs_rows else {}
        target_roles = [str(r).strip() for r in (prefs.get("target_roles") or []) if str(r).strip()]
        locations = [str(loc).strip() for loc in (prefs.get("preferred_locations") or []) if str(loc).strip()]
        adzuna = AdzunaClient(
            settings.adzuna_app_id,
            settings.adzuna_app_key,
            settings.adzuna_country,
            timeout_seconds=settings.adzuna_timeout_seconds,
        )
        fetched = adzuna.search_jobs(
            target_roles=target_roles,
            locations=locations,
            results_per_page=settings.adzuna_results_per_page,
            max_days_old=settings.adzuna_max_days_old,
        )
        existing_rows = (
            client.table("jobs").select("id,external_id").eq("source", "adzuna").execute().data or []
        )
        existing_by_external = {
            str(row.get("external_id") or "").strip(): str(row.get("id"))
            for row in existing_rows
            if str(row.get("external_id") or "").strip()
        }
        created = 0
        updated = 0
        stamp = utc_now()
        for job in fetched:
            external_id = str(job.get("external_id") or "").strip()
            if not external_id:
                continue
            payload = {
                "source": "adzuna",
                "external_id": external_id,
                "title": job.get("title") or "Unknown Title",
                "company": job.get("company") or "Unknown Company",
                "location": job.get("location"),
                "description": job.get("description") or "",
                "application_url": job.get("application_url"),
                "salary_min": job.get("salary_min"),
                "salary_max": job.get("salary_max"),
                "published_at": job.get("published_at") or stamp,
                "latitude": job.get("latitude"),
                "longitude": job.get("longitude"),
                "is_active": True,
                "requirements": job.get("requirements") or [],
                "updated_at": stamp,
            }
            existing_id = existing_by_external.get(external_id)
            if existing_id:
                client.table("jobs").update(payload).eq("id", existing_id).execute()
                updated += 1
            else:
                new_id = str(uuid.uuid4())
                client.table("jobs").insert({**payload, "id": new_id, "created_at": stamp}).execute()
                existing_by_external[external_id] = new_id
                created += 1
        _external_sync_last[str(user.id)] = time.monotonic()
        write_activity(
            client,
            user,
            "jobs_external_synced",
            f"Synced {created + updated} external jobs ({created} new, {updated} updated)",
            "jobs",
            None,
        )
        return {
            "provider": "adzuna",
            "configured": adzuna.configured,
            "fetched": len(fetched),
            "created": created,
            "updated": updated,
            "roles": target_roles,
            "locations": locations,
        }
    finally:
        _external_sync_lock.release()


@router.get("/jobs/{job_id}")
def get_job(
    job_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    rows = (
        client_for(settings, user)
        .table("jobs")
        .select("*")
        .eq("id", str(job_id))
        .eq("is_active", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ApiError(404, "job_not_found", "The job was not found.")
    return rows[0]


@router.get("/job-recommendations")
def list_job_recommendations(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    rows = owned_rows(client, "job_recommendations", user, "generated_at")
    jobs = client.table("jobs").select("*").in_("id", [row["job_id"] for row in rows]).execute().data if rows else []
    by_id = {str(job["id"]): job for job in jobs}
    return [{**row, "job": by_id.get(str(row.get("job_id")))} for row in rows]


@router.post("/job-recommendations/generate")
def generate_job_recommendations(
    payload: JobRecommendationGenerate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Score active local job records against the candidate's confirmed resume evidence."""
    client = client_for(settings, user)
    if payload.resume_version_id:
        version = owned_row(client, "resume_versions", payload.resume_version_id, user)
        if version.get("extraction_status") != "confirmed":
            raise ApiError(
                409,
                "confirmed_resume_required",
                "Confirm the extracted resume before generating job recommendations.",
            )
    else:
        active = client.table("resumes").select("id,title").eq("user_id", str(user.id)).eq("is_active", True).is_("deleted_at", "null").limit(1).execute().data or []
        if not active:
            raise ApiError(409, "active_resume_required", "Activate a confirmed resume before generating job recommendations.")
        versions = client.table("resume_versions").select("*").eq("resume_id", active[0]["id"]).eq("user_id", str(user.id)).eq("extraction_status", "confirmed").order("created_at", desc=True).limit(1).execute().data or []
        if not versions:
            raise ApiError(409, "confirmed_resume_required", "Confirm the extracted resume before generating job recommendations.")
        version = versions[0]
    resume = owned_row(client, "resumes", version["resume_id"], user)
    if resume.get("deleted_at"):
        raise ApiError(409, "resume_deleted", "The selected resume was deleted. Activate another resume first.")
    skills, evidence_text = candidate_skill_evidence(client, str(user.id), resume, version)
    jobs = (
        client.table("jobs")
        .select("*")
        .eq("is_active", True)
        .order("published_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )
    if payload.location:
        needle = payload.location.casefold()
        jobs = [job for job in jobs if needle in str(job.get("location") or "").casefold()]
    if payload.work_mode:
        needle = payload.work_mode.casefold()
        jobs = [
            job
            for job in jobs
            if needle in str(job.get("work_mode") or _infer_work_mode(job) or "").casefold()
        ]
    if payload.salary_min is not None:
        jobs = [
            job
            for job in jobs
            if job.get("salary_max") is not None and float(job.get("salary_max") or 0) >= float(payload.salary_min)
        ]
    ranked = sorted(
        (score_job(job, skills, evidence_text) for job in jobs),
        key=lambda row: row["match_score"],
        reverse=True,
    )
    page = ranked[payload.offset : payload.offset + payload.limit]
    # Always clear prior recommendations for this resume version before writing a page
    # so offset>0 pagination cannot accumulate duplicate (user, resume, job) rows.
    if payload.offset == 0:
        client.table("job_recommendations").delete().eq("user_id", str(user.id)).eq(
            "resume_version_id", str(version["id"])
        ).execute()
    recommendations = []
    for row in page:
        job_id = str(row["job"]["id"])
        # Upsert-like: remove any existing row for this job+resume then insert.
        client.table("job_recommendations").delete().eq("user_id", str(user.id)).eq(
            "resume_version_id", str(version["id"])
        ).eq("job_id", job_id).execute()
        stored = client.table("job_recommendations").insert({
            "user_id": str(user.id),
            "job_id": job_id,
            "resume_version_id": str(version["id"]),
            "match_score": row["match_score"],
            "match_breakdown": row["match_breakdown"],
            "evidence": row["evidence"],
            "algorithm_version": CAREER_MATCH_ALGORITHM_VERSION,
        }).execute().data[0]
        recommendations.append({**stored, "job": row["job"]})
    return {
        "resume_version_id": version["id"],
        "algorithm_version": CAREER_MATCH_ALGORITHM_VERSION,
        "recommendations": recommendations,
        "candidate_evidence": sorted(skills),
    }


@router.get("/saved-jobs")
def list_saved_jobs(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    rows = (
        client.table("saved_jobs")
        .select("*")
        .eq("user_id", str(user.id))
        .order("saved_at", desc=True)
        .execute()
        .data
        or []
    )
    job_ids = [str(row.get("job_id")) for row in rows if row.get("job_id")]
    jobs = (
        client.table("jobs").select("*").in_("id", job_ids).execute().data if job_ids else []
    )
    by_id = {str(job["id"]): job for job in (jobs or [])}
    return [{**row, "jobs": by_id.get(str(row.get("job_id")))} for row in rows]


@router.post("/saved-jobs/{job_id}", status_code=201)
def save_job(
    job_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    job = (
        client.table("jobs").select("id").eq("id", str(job_id)).eq("is_active", True).limit(1).execute().data
        or []
    )
    if not job:
        raise ApiError(404, "job_not_found", "The job was not found.")
    result = (
        client.table("saved_jobs")
        .upsert({"user_id": str(user.id), "job_id": str(job_id), "status": "saved"})
        .execute()
        .data[0]
    )
    write_activity(client, user, "job_saved", "Job saved", "job", str(job_id))
    return result


@router.patch("/saved-jobs/{job_id}")
def patch_saved_job(
    job_id: UUID,
    payload: SavedJobPatch,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = (
        client_for(settings, user)
        .table("saved_jobs")
        .update(payload.model_dump())
        .eq("job_id", str(job_id))
        .eq("user_id", str(user.id))
        .execute()
        .data
        or []
    )
    if not result:
        raise ApiError(404, "saved_job_not_found", "The job is not saved to your account.")
    return result[0]


@router.delete("/saved-jobs/{job_id}", status_code=204)
def unsave_job(
    job_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    client.table("saved_jobs").delete().eq("job_id", str(job_id)).eq("user_id", str(user.id)).execute()
    write_activity(client, user, "job_unsaved", "Job removed from saved jobs", "job", str(job_id))


@router.get("/settings")
def get_settings_records(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    return {
        "notifications": ensure_preference_row(client, "notification_preferences", str(user.id)),
        "privacy": ensure_preference_row(client, "privacy_preferences", str(user.id)),
    }


@router.put("/settings/notifications")
def update_notifications(
    payload: NotificationSettings,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    result = client.table("notification_preferences").upsert(
        {"user_id": str(user.id), **payload.model_dump()}
    ).execute().data or []
    if not result:
        raise ApiError(500, "notifications_save_failed", "Notification settings could not be saved.")
    return result[0]


@router.put("/settings/privacy")
def update_privacy(
    payload: PrivacySettings,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    result = client.table("privacy_preferences").upsert(
        {"user_id": str(user.id), **payload.model_dump()}
    ).execute().data or []
    if not result:
        raise ApiError(500, "privacy_save_failed", "Privacy settings could not be saved.")
    return result[0]


@router.delete("/account", status_code=204)
def delete_account(
    payload: AccountDeleteRequest | None = Body(default=None),
    x_confirm_delete: str | None = Header(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Permanently delete the signed-in candidate account and all owned data.

    Confirmation (required): body.confirmation or header X-Confirm-Delete must equal
    "DELETE MY ACCOUNT". Body email must match the account email.
    """
    from app.features.auth.account_deletion import delete_user_owned_records

    if payload is None:
        raise ApiError(
            400,
            "account_deletion_confirmation_required",
            f"Explicit confirmation and account email are required. Type exactly: {CONFIRM_PHRASE}",
        )
    confirmation = payload.confirmation or x_confirm_delete
    if not confirmation_is_valid(confirmation):
        raise ApiError(
            400,
            "account_deletion_confirmation_required",
            f"Explicit confirmation is required. Type exactly: {CONFIRM_PHRASE}",
        )
    if not email_matches_account(payload.email, user.email):
        raise ApiError(
            400,
            "account_deletion_email_mismatch",
            "The email does not match this signed-in account.",
        )

    user_client = client_for(settings, user)
    storage_paths = collect_user_storage_paths(user_client, user)

    # Capture Firebase UID before we delete the users document.
    firebase_uid = ""
    try:
        user_rows = (
            user_client.table("users")
            .select("firebase_uid")
            .eq("id", str(user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if user_rows:
            firebase_uid = str(user_rows[0].get("firebase_uid") or "").strip()
    except Exception:
        logger.exception("account_delete_firebase_uid_lookup_failed user_id=%s", user.id)

    admin = database_client(settings)
    # Fail closed: do not erase Firestore identity while storage blobs may remain.
    try:
        purge_user_storage(admin, settings, user, storage_paths)
    except Exception as exc:
        logger.exception("account_delete_storage_purge_failed user_id=%s", user.id)
        raise ApiError(
            500,
            "account_deletion_incomplete",
            "Could not remove all stored account files. Account deletion stopped so data stays consistent.",
        ) from exc

    delete_user_owned_records(admin, user)
    try:
        admin.table("users").delete().eq("id", str(user.id)).execute()
    except Exception as exc:
        raise ApiError(
            500,
            "account_deletion_failed",
            "The account could not be deleted from the local database.",
        ) from exc

    # Best-effort: remove the Firebase Auth identity so re-login cannot resurrect a
    # half-deleted account. Failure here is logged only — Firestore is already gone.
    if firebase_uid and settings.firebase_configured:
        try:
            from firebase_admin import auth as firebase_auth

            from app.database.client import firebase_admin_app

            firebase_auth.delete_user(firebase_uid, app=firebase_admin_app(settings))
        except Exception:
            logger.exception(
                "account_delete_firebase_auth_failed user_id=%s firebase_uid=%s",
                user.id,
                firebase_uid,
            )
