import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, Header, UploadFile

from app.ats import ALGORITHM_VERSION, score_resume
from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.documents import (
    extract_sections,
    extract_skill_candidates,
    extract_text,
    infer_job_metadata,
    infer_resume_title,
    safe_filename,
    sha256_bytes,
    validate_document,
)
from app.errors import ApiError
from app.repository import (
    CANDIDATE_TABLES,
    client_for,
    owned_row,
    owned_rows,
    recalculate_completion,
    write_activity,
)
from app.resume_improvement_routes import router as resume_improvement_router
from app.schemas import (
    AtsAnalysisCreate,
    ExtractionPatch,
    InterviewCreate,
    InterviewResponseCreate,
    JobDescriptionTextCreate,
    LearningPathCreate,
    NotificationSettings,
    JobDescriptionMetadataPatch,
    PreferencesUpdate,
    PrivacySettings,
    ProfilePatch,
    SavedJobPatch,
)
from app.supabase_clients import create_admin_supabase_client

router = APIRouter()
router.include_router(resume_improvement_router)


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "supabase_configured": settings.supabase_configured,
        "nvidia_configured": settings.nvidia_configured,
    }


@router.get("/health/supabase")
def health_supabase(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    if not settings.supabase_configured:
        raise ApiError(503, "supabase_not_configured", "Supabase is not configured.")
    try:
        from app.supabase_clients import create_admin_supabase_client

        admin = create_admin_supabase_client(settings)
        # Lightweight connectivity probe against a core candidate table.
        admin.table("profiles").select("id").limit(1).execute()
        return {"status": "reachable", "configured": True, "tables_reachable": True}
    except ApiError:
        return {"status": "configured", "configured": True, "tables_reachable": False, "admin_probe": "unavailable"}
    except Exception:
        return {"status": "configured", "configured": True, "tables_reachable": False}


@router.get("/me/bootstrap")
def bootstrap(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
) -> dict[str, Any]:
    client = client_for(settings, user)
    # Opportunistic cleanup of failed ATS rows older than 7 days (candidate-owned only).
    try:
        cutoff = (datetime.now(UTC) - timedelta(days=7)).isoformat()
        client.table("ats_analyses").delete().eq("user_id", str(user.id)).eq("status", "failed").lt(
            "created_at", cutoff
        ).execute()
    except Exception:
        pass
    profile = recalculate_completion(client, user)
    active_resume = (
        client.table("resumes")
        .select("id,title")
        .eq("user_id", str(user.id))
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    confirmed_resume = (
        client.table("resume_versions")
        .select("id", count="exact", head=True)
        .eq("user_id", str(user.id))
        .eq("extraction_status", "confirmed")
        .execute()
    )
    latest_jd = (
        client.table("job_descriptions")
        .select("id,title,company,role_title")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    latest_analysis = (
        client.table("ats_analyses")
        .select("id,overall_score,status,created_at")
        .eq("user_id", str(user.id))
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    recent_activity = (
        client.table("activity_events")
        .select("id,event_type,summary,entity_type,entity_id,created_at")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(8)
        .execute()
        .data
        or []
    )
    unread = (
        client.table("user_notifications")
        .select("id", count="exact")
        .eq("user_id", str(user.id))
        .is_("read_at", "null")
        .execute()
    )
    counts = {}
    for key, table in {
        "resumes": "resumes",
        "ats_analyses": "ats_analyses",
        "interviews": "interview_sessions",
        "learning_paths": "learning_paths",
        "saved_jobs": "saved_jobs",
    }.items():
        counts[key] = (
            client.table(table)
            .select("*", count="exact", head=True)
            .eq("user_id", str(user.id))
            .execute()
            .count
            or 0
        )
    failed_ats = (
        client.table("ats_analyses")
        .select("id", count="exact", head=True)
        .eq("user_id", str(user.id))
        .eq("status", "failed")
        .execute()
        .count
        or 0
    )
    return {
        "profile": profile,
        "active_resume": active_resume[0] if active_resume else None,
        "active_job_description": latest_jd[0] if latest_jd else None,
        "latest_ats_analysis": latest_analysis[0] if latest_analysis else None,
        "unread_notification_count": unread.count or 0,
        "counts": counts,
        "recent_activity": recent_activity,
        "workspace": {
            "profile_completion": profile.get("profile_completion") or 0,
            "has_active_resume": bool(active_resume),
            "has_confirmed_resume": bool(confirmed_resume.count),
            "failed_ats_count": failed_ats,
            "ready_for_ats": bool(confirmed_resume.count) and bool(latest_jd),
        },
        "capabilities": {
            "ats_scoring": True,
            "interview_evaluation": False,
            "job_recommendations": False,
            "nvidia_configured": settings.nvidia_configured,
        },
    }


@router.get("/me/activity")
def list_activity(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
) -> list[dict[str, Any]]:
    return (
        client_for(settings, user)
        .table("activity_events")
        .select("id,event_type,summary,entity_type,entity_id,created_at")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .limit(40)
        .execute()
        .data
        or []
    )


def _normalize_token(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _prepare_candidate_payload(resource: str, payload: dict[str, Any], *, require_core: bool) -> dict[str, Any]:
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
    elif resource == "education" and require_core:
        if not str(data.get("institution") or "").strip():
            raise ApiError(400, "invalid_education", "Institution is required.")
    elif resource == "links":
        if require_core or "link_type" in data or "url" in data:
            link_type = str(data.get("link_type") or "").strip()
            url = str(data.get("url") or "").strip()
            if require_core and (link_type not in {"linkedin", "github", "portfolio", "website", "other"} or not url):
                raise ApiError(400, "invalid_link", "A valid link type and URL are required.")
            if link_type:
                data["link_type"] = link_type
            if url:
                data["url"] = url
    return data


@router.get("/profile")
def get_profile(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    client = client_for(settings, user)
    # Recalculate so the profile page always shows the current completion score.
    profile = recalculate_completion(client, user)
    return {
        "profile": profile,
        "preferences": client.table("candidate_preferences")
        .select("*")
        .eq("user_id", str(user.id))
        .single()
        .execute()
        .data,
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
    return profile


@router.put("/profile/preferences")
def update_preferences(
    payload: PreferencesUpdate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    result = (
        client.table("candidate_preferences")
        .update(payload.model_dump())
        .eq("user_id", str(user.id))
        .execute()
        .data
    )
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


@router.get("/profile/{resource}")
def list_candidate_records(
    resource: str, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    table = CANDIDATE_TABLES.get(resource)
    if not table:
        raise ApiError(404, "resource_not_found", "The requested profile resource does not exist.")
    return owned_rows(
        client_for(settings, user),
        table,
        user,
        "display_order" if resource not in {"skills", "certifications"} else None,
    )


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


def _upload_resume_version(
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
        text = extract_text(content, mime)
        structured = extract_sections(text)
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
            "extraction_warnings": structured["warnings"],
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
    return owned_rows(client_for(settings, user), "resumes", user, "created_at")


@router.post("/resumes", status_code=201)
def create_resume(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    resume_id = str(uuid.uuid4())
    profile_name = ""
    try:
        profile_row = (
            client.table("profiles").select("full_name").eq("id", str(user.id)).single().execute().data or {}
        )
        profile_name = str(profile_row.get("full_name") or "").strip()
    except Exception:
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
                "is_active": not bool(owned_rows(client, "resumes", user)),
            }
        )
        .execute()
        .data[0]
    )
    try:
        version = _upload_resume_version(client, settings, user, resume_id, file, file.file.read())
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


@router.post("/resumes/{resume_id}/activate")
def activate_resume(
    resume_id: UUID, user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    client = client_for(settings, user)
    owned_row(client, "resumes", resume_id, user)
    client.table("resumes").update({"is_active": False}).eq("user_id", str(user.id)).execute()
    result = (
        client.table("resumes")
        .update({"is_active": True})
        .eq("id", str(resume_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    write_activity(client, user, "resume_activated", "Active resume changed", "resume", str(resume_id))
    return result


@router.post("/resumes/{resume_id}/versions", status_code=201)
def create_resume_version(
    resume_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "resumes", resume_id, user)
    return _upload_resume_version(client, settings, user, str(resume_id), file, file.file.read())


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
def create_jd(
    payload: JobDescriptionTextCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    structured = extract_sections(payload.raw_text, "jd-extraction-v1")
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
        "extraction_warnings": structured["warnings"],
    }
    result = client.table("job_descriptions").insert(record).execute().data[0]
    write_activity(
        client, user, "job_description_created", "Job description created", "job_description", result["id"]
    )
    return result


@router.post("/job-descriptions/upload", status_code=201)
def upload_jd(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    company: str | None = Form(default=None),
    role_title: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    content = file.file.read()
    mime = validate_document(
        file.filename or "document", file.content_type, content, settings.document_max_bytes
    )
    text = extract_text(content, mime)
    structured = extract_sections(text, "jd-extraction-v1")
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
            "extraction_warnings": structured["warnings"],
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
        client, user, "job_description_updated", "Job description metadata updated", "job_description", str(jd_id)
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


def _enrich_ats_analysis(client, user: CurrentUser, analysis: dict[str, Any]) -> dict[str, Any]:
    """Attach the resume version and job description used for a stored ATS run."""
    enriched = dict(analysis)
    try:
        version = owned_row(client, "resume_versions", analysis["resume_version_id"], user)
        resume = owned_row(client, "resumes", version["resume_id"], user)
        if resume.get("deleted_at"):
            enriched["resume"] = {
                "id": resume.get("id"),
                "title": resume.get("title") or "Deleted resume",
                "original_filename": version.get("original_filename"),
                "version_number": version.get("version_number"),
                "created_at": version.get("created_at"),
                "unavailable": True,
            }
        else:
            enriched["resume"] = {
                "id": resume.get("id"),
                "title": resume.get("title"),
                "original_filename": version.get("original_filename"),
                "version_number": version.get("version_number"),
                "created_at": version.get("created_at"),
                "unavailable": False,
            }
    except ApiError:
        enriched["resume"] = {
            "id": None,
            "title": "Resume unavailable",
            "original_filename": None,
            "version_number": None,
            "created_at": None,
            "unavailable": True,
        }
    try:
        job = owned_row(client, "job_descriptions", analysis["job_description_id"], user)
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
    except ApiError:
        enriched["job_description"] = {
            "id": None,
            "title": "Job description unavailable",
            "company": None,
            "role_title": None,
            "input_type": None,
            "original_filename": None,
            "created_at": None,
            "unavailable": True,
        }
    return enriched


@router.get("/ats-analyses")
def list_ats(user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    client = client_for(settings, user)
    analyses = owned_rows(client, "ats_analyses", user, "created_at")
    # Newest first for the history view; hide long-failed noise.
    analyses = [row for row in reversed(analyses) if row.get("status") != "failed"]
    return [_enrich_ats_analysis(client, user, row) for row in analyses]


@router.get("/ats-analyses/{analysis_id}")
def get_ats(
    analysis_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    return _enrich_ats_analysis(client, user, owned_row(client, "ats_analyses", analysis_id, user))


@router.post("/ats-analyses", status_code=201)
def create_ats(
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

    existing = (
        client.table("ats_analyses")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("resume_version_id", str(payload.resume_version_id))
        .eq("job_description_id", str(payload.job_description_id))
        .eq("algorithm_version", ALGORITHM_VERSION)
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return existing[0]

    try:
        score = score_resume(version.get("plain_text") or "", job.get("raw_text") or "")
    except ValueError as exc:
        raise ApiError(422, "ats_input_insufficient", str(exc)) from exc

    analysis = (
        client.table("ats_analyses")
        .insert(
            {
                "user_id": str(user.id),
                "resume_version_id": str(payload.resume_version_id),
                "job_description_id": str(payload.job_description_id),
                "status": "processing",
                "algorithm_version": ALGORITHM_VERSION,
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
                "requirement_type": "keyword",
                "resume_evidence_text": item.resume_evidence,
                "resume_section": item.resume_section,
                "resume_source_reference": {"resume_version_id": str(payload.resume_version_id)},
                "job_description_source_reference": {"job_description_id": str(payload.job_description_id)},
                "match_status": "strong_match" if item.matched else "not_found",
                "score_contribution": item.score_contribution,
                "rule_id": "exact_normalized_keyword",
                "explanation": (
                    "The normalized term appears in the resume."
                    if item.matched
                    else "The normalized term was not found in the resume."
                ),
            }
            for item in score.evidence
        ]
        if evidence_rows:
            client.table("ats_evidence").insert(evidence_rows).execute()
        completed = (
            client.table("ats_analyses")
            .update(
                {
                    "status": "completed",
                    "overall_score": score.overall_score,
                    "score_breakdown": score.breakdown,
                    "summary": {
                        "method": "Deterministic normalized keyword coverage",
                        "matched": len(score.matched_terms),
                        "total": len(score.evidence),
                        "disclaimer": "Coverage evidence is not a hiring prediction.",
                    },
                    "completed_at": utc_now(),
                }
            )
            .eq("id", analysis["id"])
            .eq("user_id", str(user.id))
            .execute()
            .data[0]
        )
    except Exception as exc:
        client.table("ats_analyses").update(
            {
                "status": "failed",
                "error_code": "ats_persistence_failed",
                "error_message": "Scoring could not be persisted.",
            }
        ).eq("id", analysis["id"]).eq("user_id", str(user.id)).execute()
        raise ApiError(500, "ats_persistence_failed", "The ATS analysis could not be persisted.") from exc

    write_activity(
        client,
        user,
        "ats_analysis_completed",
        "ATS keyword coverage completed",
        "ats_analysis",
        completed["id"],
    )
    return completed


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


@router.post("/interviews/{session_id}/start")
def start_interview(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "interview_sessions", session_id, user)
    result = (
        client.table("interview_sessions")
        .update({"status": "in_progress", "started_at": utc_now()})
        .eq("id", str(session_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )
    write_activity(
        client, user, "interview_started", "Interview session started", "interview_session", str(session_id)
    )
    return result


@router.post("/interviews/{session_id}/responses", status_code=201)
def add_response(
    session_id: UUID,
    payload: InterviewResponseCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    client = client_for(settings, user)
    owned_row(client, "interview_sessions", session_id, user)
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
    path["items"] = (
        client.table("learning_items")
        .select("*,learning_resources(*)")
        .eq("learning_path_id", str(path_id))
        .eq("user_id", str(user.id))
        .order("position")
        .execute()
        .data
        or []
    )
    return path


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
    return owned_rows(client_for(settings, user), "job_recommendations", user, "generated_at")


@router.get("/saved-jobs")
def list_saved_jobs(
    user: CurrentUser = Depends(get_current_user), settings: Settings = Depends(get_settings)
):
    return (
        client_for(settings, user)
        .table("saved_jobs")
        .select("*,jobs(*)")
        .eq("user_id", str(user.id))
        .order("saved_at", desc=True)
        .execute()
        .data
        or []
    )


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
    return (
        client_for(settings, user)
        .table("saved_jobs")
        .update(payload.model_dump())
        .eq("job_id", str(job_id))
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


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
        "notifications": client.table("notification_preferences")
        .select("*")
        .eq("user_id", str(user.id))
        .single()
        .execute()
        .data,
        "privacy": client.table("privacy_preferences")
        .select("*")
        .eq("user_id", str(user.id))
        .single()
        .execute()
        .data,
    }


@router.put("/settings/notifications")
def update_notifications(
    payload: NotificationSettings,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return (
        client_for(settings, user)
        .table("notification_preferences")
        .update(payload.model_dump())
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


@router.put("/settings/privacy")
def update_privacy(
    payload: PrivacySettings,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return (
        client_for(settings, user)
        .table("privacy_preferences")
        .update(payload.model_dump())
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


@router.delete("/account", status_code=204)
def delete_account(
    x_confirm_delete: str | None = Header(default=None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    if x_confirm_delete != "DELETE MY ACCOUNT":
        raise ApiError(
            400,
            "account_deletion_confirmation_required",
            "Explicit account deletion confirmation is required.",
        )
    admin = create_admin_supabase_client(settings)
    try:
        admin.auth.admin.delete_user(str(user.id))
    except Exception as exc:
        raise ApiError(500, "account_deletion_failed", "The account could not be deleted.") from exc
