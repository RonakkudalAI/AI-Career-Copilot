import copy
import uuid
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any

from app.auth import CurrentUser
from app.config import Settings
from app.documents import DOCX_MIME, sha256_bytes
from app.errors import ApiError
from app.nvidia_client import NvidiaClient
from app.repository import owned_row, write_activity
from app.resume_evidence import ResumeBlock, build_blocks, evidence_bundle
from app.resume_exports import render_docx
from app.resume_improvement_repository import (
    completed_analysis,
    confirmed_jd,
    confirmed_version,
    create_run,
    get_run,
    get_suggestion,
    insert_suggestions,
    list_run_suggestions,
    now_iso,
    update_run,
)
from app.resume_validation import is_source_stale, validate_suggestion
from app.schemas import ResumeImprovementCreate, ResumeSuggestionDecision


def capabilities(settings: Settings) -> dict[str, Any]:
    provider = NvidiaClient(settings).capability()
    return {
        "nvidia_configured": provider["configured"],
        "selected_model": provider["model"],
        "improvement_available": provider["configured"],
        "export_formats": ["pdf", "docx"],
        "ats_context_available": True,
        "manual_editing_available": True,
    }


async def generate_improvements(
    client, settings: Settings, user: CurrentUser, payload: ResumeImprovementCreate
) -> dict[str, Any]:
    version = confirmed_version(client, payload.resume_version_id, user)
    blocks, _, context = evidence_bundle(version.get("structured_content") or {}, list(payload.section_keys))
    selected = context["selected_blocks"]
    if not selected:
        raise ApiError(
            422, "no_supported_source_blocks", "The selected sections contain no confirmed source blocks."
        )
    if sum(len(item["text"]) for item in selected) > settings.improvement_max_source_chars:
        raise ApiError(413, "improvement_source_too_large", "Select fewer or smaller resume sections.")

    jd = confirmed_jd(client, payload.job_description_id, user) if payload.job_description_id else None
    ats_evidence: list[dict[str, Any]] = []
    if payload.ats_analysis_id:
        analysis, ats_rows = completed_analysis(client, payload.ats_analysis_id, user)
        if analysis["resume_version_id"] != str(payload.resume_version_id):
            raise ApiError(
                409, "ats_resume_mismatch", "The selected ATS evidence belongs to a different resume version."
            )
        ats_evidence = [
            {
                "requirement": row.get("requirement_text"),
                "match_status": row.get("match_status"),
                "resume_evidence": row.get("resume_evidence_text"),
            }
            for row in ats_rows
        ]

    run = create_run(
        client,
        user,
        {
            "resume_version_id": str(payload.resume_version_id),
            "job_description_id": str(payload.job_description_id) if payload.job_description_id else None,
            "ats_analysis_id": str(payload.ats_analysis_id) if payload.ats_analysis_id else None,
            "status": "pending",
            "provider": "nvidia",
            "model": settings.nvidia_model or "unconfigured",
            "prompt_version": settings.nvidia_prompt_version,
            "requested_sections": list(payload.section_keys),
        },
    )
    try:
        update_run(client, run["id"], user, {"status": "generating"})
        context["job_description"] = (
            {
                "structured_content": jd.get("structured_content") or {},
                "text": (jd.get("raw_text") or "")[: settings.improvement_max_jd_chars],
            }
            if jd
            else None
        )
        context["ats_evidence"] = ats_evidence
        result = await NvidiaClient(settings).generate(context)
        update_run(client, run["id"], user, {"status": "validating"})
        block_map = {block.block_id: block for block in blocks}
        stored: list[dict[str, Any]] = []
        blocked = 0
        for suggestion in result.suggestions:
            validation = validate_suggestion(suggestion, block_map, set(payload.section_keys))
            if validation.status == "blocked":
                blocked += 1
                continue
            stored.append(
                {
                    "user_id": str(user.id),
                    "run_id": run["id"],
                    "analysis_id": str(payload.ats_analysis_id) if payload.ats_analysis_id else None,
                    "resume_version_id": str(payload.resume_version_id),
                    "section_key": suggestion.section_key,
                    "source_block_id": suggestion.source_block_id,
                    "source_text_hash": validation.source_hash,
                    "original_text": suggestion.source_text,
                    "suggested_text": suggestion.proposed_text,
                    "reason": suggestion.reason,
                    "suggestion_type": suggestion.suggestion_type,
                    "evidence_references": suggestion.evidence_references,
                    "validation_status": validation.status,
                    "validation_issues": validation.issues,
                    "decision": "pending",
                }
            )
        suggestions = insert_suggestions(client, stored)
        summary = {"received": len(result.suggestions), "available": len(suggestions), "blocked": blocked}
        run = update_run(
            client,
            run["id"],
            user,
            {"status": "completed", "validation_summary": summary, "completed_at": now_iso()},
        )
        if not suggestions:
            return {
                "run": run,
                "suggestions": [],
                "message": "No safe improvements were generated from the available evidence.",
            }
        return {"run": run, "suggestions": suggestions}
    except ApiError as exc:
        update_run(
            client, run["id"], user, {"status": "failed", "error_code": exc.code, "completed_at": now_iso()}
        )
        raise
    except Exception as exc:
        update_run(
            client,
            run["id"],
            user,
            {"status": "failed", "error_code": "improvement_failed", "completed_at": now_iso()},
        )
        raise ApiError(
            500, "improvement_failed", "The resume improvement request could not be completed."
        ) from exc


def decide_suggestion(
    client, user: CurrentUser, suggestion_id: str, payload: ResumeSuggestionDecision
) -> dict[str, Any]:
    suggestion = get_suggestion(client, suggestion_id, user)
    if suggestion.get("validation_status") not in {"passed", "warning"}:
        raise ApiError(409, "suggestion_not_selectable", "This suggestion cannot be selected.")
    issues = list(suggestion.get("validation_issues") or [])
    if payload.decision == "edited" and "candidate_entered_confirmed" not in issues:
        issues.append("candidate_entered_confirmed")
    values = {
        "decision": payload.decision,
        "candidate_text": payload.candidate_text if payload.decision == "edited" else None,
        "decided_at": None if payload.decision == "pending" else now_iso(),
        "validation_issues": issues,
    }
    return (
        client.table("resume_suggestions")
        .update(values)
        .eq("id", suggestion_id)
        .eq("user_id", str(user.id))
        .execute()
        .data[0]
    )


def _replace_block(structured: dict[str, Any], block: ResumeBlock, value: str) -> None:
    section = (structured.get("sections") or {}).get(block.section_key)
    if not isinstance(section, list):
        raise ApiError(409, "stale_resume_version", "The resume structure changed. Regenerate suggestions.")
    index = int(block.block_id.rsplit("-", 1)[1]) - 1
    if index < 0 or index >= len(section):
        raise ApiError(409, "stale_resume_version", "The resume structure changed. Regenerate suggestions.")
    section[index] = value


def _plain_text(structured: dict[str, Any]) -> str:
    values = [str(item) for item in structured.get("unclassified_blocks") or []]
    for section, lines in (structured.get("sections") or {}).items():
        values.append(str(section).replace("_", " ").title())
        values.extend(str(line) for line in lines if str(line).strip())
    return "\n".join(values).strip()


def apply_suggestions(client, settings: Settings, user: CurrentUser, run_id: str) -> dict[str, Any]:
    run = get_run(client, run_id, user)
    if run.get("status") != "completed":
        raise ApiError(409, "run_not_completed", "Only a completed improvement run can create a version.")
    source = confirmed_version(client, run["resume_version_id"], user)
    suggestions = [
        item
        for item in list_run_suggestions(client, run_id, user)
        if item["decision"] in {"accepted", "edited"}
    ]
    if not suggestions:
        raise ApiError(
            409,
            "no_approved_suggestions",
            "Accept or edit at least one suggestion before creating a version.",
        )
    if len({item["source_block_id"] for item in suggestions}) != len(suggestions):
        raise ApiError(
            409, "conflicting_suggestions", "Choose only one approved change for each source block."
        )
    block_map = {block.block_id: block for block in build_blocks(source["structured_content"])}
    updated = copy.deepcopy(source["structured_content"])
    for suggestion in suggestions:
        block = block_map.get(suggestion["source_block_id"])
        if not block or is_source_stale(suggestion["source_text_hash"], block.text):
            client.table("resume_suggestions").update({"validation_status": "stale"}).eq(
                "id", suggestion["id"]
            ).eq("user_id", str(user.id)).execute()
            raise ApiError(409, "stale_resume_version", "The source resume changed. Regenerate suggestions.")
        replacement = (
            suggestion["candidate_text"]
            if suggestion["decision"] == "edited"
            else suggestion["suggested_text"]
        )
        _replace_block(updated, block, replacement)

    count = (
        client.table("resume_versions")
        .select("id", count="exact", head=True)
        .eq("resume_id", source["resume_id"])
        .execute()
        .count
        or 0
    )
    version_id = str(uuid.uuid4())
    version_number = count + 1
    content = render_docx(updated)
    path = f"{user.id}/resumes/{source['resume_id']}/versions/{version_id}/{uuid.uuid4()}.docx"
    try:
        client.storage.from_(settings.document_bucket).upload(
            path, content, {"content-type": DOCX_MIME, "upsert": "false"}
        )
        record = (
            client.table("resume_versions")
            .insert(
                {
                    "id": version_id,
                    "resume_id": source["resume_id"],
                    "user_id": str(user.id),
                    "version_number": version_number,
                    "source_type": "edited",
                    "original_filename": f"resume-v{version_number}.docx",
                    "storage_path": path,
                    "mime_type": DOCX_MIME,
                    "size_bytes": len(content),
                    "sha256": sha256_bytes(content),
                    "plain_text": _plain_text(updated),
                    "structured_content": updated,
                    "extraction_status": "confirmed",
                    "candidate_confirmed_at": datetime.now(UTC).isoformat(),
                    "created_from_version_id": source["id"],
                    "improvement_run_id": run_id,
                    "change_metadata": {
                        "applied_suggestion_ids": [item["id"] for item in suggestions],
                        "candidate_confirmed_edit_ids": [
                            item["id"] for item in suggestions if item["decision"] == "edited"
                        ],
                    },
                }
            )
            .execute()
            .data[0]
        )
    except Exception as exc:
        try:
            client.storage.from_(settings.document_bucket).remove([path])
        except Exception:
            pass
        raise ApiError(
            500, "resume_version_create_failed", "The improved resume version could not be created."
        ) from exc
    write_activity(
        client,
        user,
        "resume_version_created",
        "Improved resume version created",
        "resume_version",
        version_id,
    )
    return {"resume_version": record, "applied_suggestion_ids": [item["id"] for item in suggestions]}


def compare_versions(client, user: CurrentUser, left_id: str, right_id: str) -> dict[str, Any]:
    left = owned_row(client, "resume_versions", left_id, user)
    right = owned_row(client, "resume_versions", right_id, user)
    if left["resume_id"] != right["resume_id"]:
        raise ApiError(409, "resume_mismatch", "Versions must belong to the same resume.")
    left_blocks = {block.block_id: block for block in build_blocks(left["structured_content"])}
    right_blocks = {block.block_id: block for block in build_blocks(right["structured_content"])}
    changes = []
    for block_id in sorted(set(left_blocks) | set(right_blocks)):
        before = left_blocks.get(block_id)
        after = right_blocks.get(block_id)
        before_text, after_text = before.text if before else "", after.text if after else ""
        if before_text == after_text:
            status = "unchanged"
        elif not before_text:
            status = "added"
        elif not after_text:
            status = "removed"
        else:
            status = "modified"
        changes.append(
            {
                "block_id": block_id,
                "section_key": (after or before).section_key,
                "status": status,
                "before": before_text,
                "after": after_text,
                "similarity": round(SequenceMatcher(None, before_text, after_text).ratio(), 3),
            }
        )
    return {"source_version": left, "target_version": right, "changes": changes}


def create_manual_version(
    client, settings: Settings, user: CurrentUser, source_version_id: str, structured_content: dict[str, Any]
) -> dict[str, Any]:
    source = confirmed_version(client, source_version_id, user)
    if not isinstance(structured_content.get("sections"), dict):
        raise ApiError(422, "invalid_resume_structure", "The resume must contain structured sections.")
    if structured_content == source["structured_content"]:
        raise ApiError(409, "resume_unchanged", "Make a change before creating a new version.")
    count = (
        client.table("resume_versions")
        .select("id", count="exact", head=True)
        .eq("resume_id", source["resume_id"])
        .execute()
        .count
        or 0
    )
    version_id = str(uuid.uuid4())
    version_number = count + 1
    content = render_docx(structured_content)
    path = f"{user.id}/resumes/{source['resume_id']}/versions/{version_id}/{uuid.uuid4()}.docx"
    try:
        client.storage.from_(settings.document_bucket).upload(
            path, content, {"content-type": DOCX_MIME, "upsert": "false"}
        )
        record = (
            client.table("resume_versions")
            .insert(
                {
                    "id": version_id,
                    "resume_id": source["resume_id"],
                    "user_id": str(user.id),
                    "version_number": version_number,
                    "source_type": "edited",
                    "original_filename": f"resume-v{version_number}.docx",
                    "storage_path": path,
                    "mime_type": DOCX_MIME,
                    "size_bytes": len(content),
                    "sha256": sha256_bytes(content),
                    "plain_text": _plain_text(structured_content),
                    "structured_content": structured_content,
                    "extraction_status": "confirmed",
                    "candidate_confirmed_at": datetime.now(UTC).isoformat(),
                    "created_from_version_id": source["id"],
                    "change_metadata": {"manual_edit": True, "candidate_confirmed": True},
                }
            )
            .execute()
            .data[0]
        )
    except Exception as exc:
        try:
            client.storage.from_(settings.document_bucket).remove([path])
        except Exception:
            pass
        raise ApiError(
            500, "resume_version_create_failed", "The edited resume version could not be created."
        ) from exc
    write_activity(
        client,
        user,
        "resume_version_created",
        "Candidate-edited resume version created",
        "resume_version",
        version_id,
    )
    return record
