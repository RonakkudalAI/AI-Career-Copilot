from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.features.auth.service import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.database.repository import client_for, write_activity
from app.features.resume_management.exports import create_export, signed_export
from app.features.resume_management.improvement_repository import get_run, list_run_suggestions
from app.features.resume_management.improvements import (
    apply_suggestions,
    capabilities,
    compare_versions,
    decide_suggestion,
    generate_improvements,
)
from app.api.schemas import (
    ApplyImprovementBody,
    ResumeExportCreate,
    ResumeImprovementCreate,
    ResumeSuggestionDecision,
)

router = APIRouter(tags=["resume-improvements"])


@router.get("/resume-improvements/capabilities")
def improvement_capabilities(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return capabilities(settings)


@router.post("/resume-improvements", status_code=201)
async def create_improvement(
    payload: ResumeImprovementCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await generate_improvements(client_for(settings, user), settings, user, payload)


@router.get("/resume-improvements/{run_id}")
def read_improvement(
    run_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    client = client_for(settings, user)
    return {"run": get_run(client, run_id, user), "suggestions": list_run_suggestions(client, run_id, user)}


@router.get("/resume-improvements/{run_id}/suggestions")
def read_improvement_suggestions(
    run_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    return list_run_suggestions(client_for(settings, user), run_id, user)


@router.patch("/resume-suggestions/{suggestion_id}")
def update_suggestion_decision(
    suggestion_id: UUID,
    payload: ResumeSuggestionDecision,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return decide_suggestion(client_for(settings, user), user, str(suggestion_id), payload)


@router.post("/resume-improvements/{run_id}/apply", status_code=201)
def apply_improvement(
    run_id: UUID,
    payload: ApplyImprovementBody | None = None,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    body = payload or ApplyImprovementBody()
    return apply_suggestions(
        client_for(settings, user),
        settings,
        user,
        str(run_id),
        apply_mode=body.apply_mode,
    )


@router.get("/resume-comparisons")
def compare_resume_versions(
    source_version_id: UUID = Query(...),
    target_version_id: UUID = Query(...),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return compare_versions(client_for(settings, user), user, str(source_version_id), str(target_version_id))


@router.post("/resume-versions/{version_id}/exports", status_code=201)
def export_resume_version(
    version_id: UUID,
    payload: ResumeExportCreate,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    client = client_for(settings, user)
    record = create_export(client, settings, user, str(version_id), payload.format)
    write_activity(
        client,
        user,
        "resume_export_created",
        f"{payload.format.upper()} resume export created",
        "resume_export",
        record["id"],
    )
    return record


@router.get("/resume-exports/{export_id}/download")
def download_resume_export(
    export_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return signed_export(client_for(settings, user), settings, user, str(export_id))
