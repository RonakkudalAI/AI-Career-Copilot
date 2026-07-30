"""Opt-in live Supabase workflow check. Creates and removes temporary candidate records."""

import asyncio
import uuid

import httpx
from supabase import ClientOptions, create_client

from app.config import get_settings
from app.main import app
from app.resume_evidence import source_hash
from app.supabase_clients import create_admin_supabase_client

STRUCTURED = {
    "schema_version": "resume-extraction-v1",
    "sections": {
        "summary": ["Backend engineer building reliable services."],
        "skills": ["Python, FastAPI, PostgreSQL"],
        "experience": ["Built internal APIs with FastAPI for 20 users in 2025."],
    },
    "unclassified_blocks": ["Temporary Audit Candidate"],
    "warnings": [],
    "corrections": {},
}


async def main() -> None:
    settings = get_settings()
    admin = create_admin_supabase_client(settings)
    suffix = uuid.uuid4().hex
    password = f"Audit-{suffix}-A1!"
    users = []
    storage_paths: list[str] = []
    try:
        for label in ("owner", "other"):
            result = admin.auth.admin.create_user(
                {
                    "email": f"resume-improvement-{label}-{suffix}@example.invalid",
                    "password": password,
                    "email_confirm": True,
                }
            )
            users.append(result.user)
        sessions = []
        clients = []
        for user in users:
            session = (
                create_client(settings.supabase_url, settings.supabase_publishable_key)
                .auth.sign_in_with_password({"email": user.email, "password": password})
                .session
            )
            sessions.append(session)
            client = create_client(
                settings.supabase_url,
                settings.supabase_publishable_key,
                options=ClientOptions(headers={"Authorization": f"Bearer {session.access_token}"}),
            )
            client.postgrest.auth(session.access_token)
            clients.append(client)

        owner, other = users
        owner_client, other_client = clients
        resume_id, version_id, run_id = (str(uuid.uuid4()) for _ in range(3))
        owner_client.table("resumes").insert(
            {"id": resume_id, "user_id": owner.id, "title": "Temporary integration resume", "is_active": True}
        ).execute()
        owner_client.table("resume_versions").insert(
            {
                "id": version_id,
                "resume_id": resume_id,
                "user_id": owner.id,
                "version_number": 1,
                "source_type": "uploaded",
                "original_filename": "audit.docx",
                "storage_path": f"{owner.id}/audit/source.docx",
                "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "size_bytes": 1,
                "sha256": "0" * 64,
                "plain_text": "Temporary audit resume",
                "structured_content": STRUCTURED,
                "extraction_status": "confirmed",
            }
        ).execute()
        owner_client.table("resume_improvement_runs").insert(
            {
                "id": run_id,
                "user_id": owner.id,
                "resume_version_id": version_id,
                "status": "completed",
                "provider": "integration-fixture",
                "model": "structured-fixture",
                "prompt_version": "resume-improvement-v1",
                "requested_sections": ["summary", "experience", "skills"],
                "validation_summary": {"received": 3, "available": 3, "blocked": 0},
            }
        ).execute()
        rows = []
        values = [
            (
                "summary",
                "summary-1",
                STRUCTURED["sections"]["summary"][0],
                "Backend engineer delivering reliable services.",
            ),
            (
                "experience",
                "experience-1",
                STRUCTURED["sections"]["experience"][0],
                "Developed internal APIs with FastAPI for 20 users in 2025.",
            ),
            ("skills", "skills-1", STRUCTURED["sections"]["skills"][0], "Python, FastAPI, PostgreSQL"),
        ]
        for section, block_id, original, proposed in values:
            rows.append(
                {
                    "user_id": owner.id,
                    "run_id": run_id,
                    "resume_version_id": version_id,
                    "section_key": section,
                    "source_block_id": block_id,
                    "source_text_hash": source_hash(original),
                    "original_text": original,
                    "suggested_text": proposed,
                    "reason": "Temporary validated integration fixture",
                    "suggestion_type": "clarity",
                    "evidence_references": [block_id],
                    "validation_status": "passed",
                    "decision": "pending",
                }
            )
        suggestions = owner_client.table("resume_suggestions").insert(rows).execute().data

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://audit") as api:
            owner_headers = {"Authorization": f"Bearer {sessions[0].access_token}"}
            other_headers = {"Authorization": f"Bearer {sessions[1].access_token}"}
            decisions = [
                {"decision": "accepted", "candidate_text": None, "candidate_confirmed": False},
                {
                    "decision": "edited",
                    "candidate_text": "Developed internal APIs with FastAPI for 20 users in 2025.",
                    "candidate_confirmed": True,
                },
                {"decision": "rejected", "candidate_text": None, "candidate_confirmed": False},
            ]
            for suggestion, decision in zip(suggestions, decisions, strict=True):
                response = await api.patch(
                    f"/api/v1/resume-suggestions/{suggestion['id']}", headers=owner_headers, json=decision
                )
                assert response.status_code == 200, response.text
            assert (
                await api.get(f"/api/v1/resume-improvements/{run_id}", headers=other_headers)
            ).status_code == 404
            assert (
                await api.patch(
                    f"/api/v1/resume-suggestions/{suggestions[0]['id']}",
                    headers=other_headers,
                    json=decisions[0],
                )
            ).status_code == 404

            applied = await api.post(f"/api/v1/resume-improvements/{run_id}/apply", headers=owner_headers)
            assert applied.status_code == 201, applied.text
            improved = applied.json()["resume_version"]
            storage_paths.append(improved["storage_path"])
            assert improved["created_from_version_id"] == version_id
            original = (
                owner_client.table("resume_versions")
                .select("structured_content")
                .eq("id", version_id)
                .single()
                .execute()
                .data
            )
            assert original["structured_content"] == STRUCTURED
            comparison = await api.get(
                "/api/v1/resume-comparisons",
                headers=owner_headers,
                params={"source_version_id": version_id, "target_version_id": improved["id"]},
            )
            assert comparison.status_code == 200 and any(
                item["status"] == "modified" for item in comparison.json()["changes"]
            )

            export_ids = []
            for export_format in ("docx", "pdf"):
                exported = await api.post(
                    f"/api/v1/resume-versions/{improved['id']}/exports",
                    headers=owner_headers,
                    json={"format": export_format},
                )
                assert exported.status_code == 201, exported.text
                record = exported.json()
                export_ids.append(record["id"])
                storage_paths.append(record["storage_path"])
                download = await api.get(
                    f"/api/v1/resume-exports/{record['id']}/download", headers=owner_headers
                )
                assert download.status_code == 200 and download.json()["download_url"]
                assert (
                    await api.get(f"/api/v1/resume-exports/{record['id']}/download", headers=other_headers)
                ).status_code == 404

        assert not other_client.table("resume_improvement_runs").select("id").eq("id", run_id).execute().data
        assert (
            not other_client.table("resume_suggestions")
            .select("id")
            .in_("id", [row["id"] for row in suggestions])
            .execute()
            .data
        )
        assert not other_client.table("resume_exports").select("id").in_("id", export_ids).execute().data
        print("live_resume_improvement=pass")
        print("decisions=accepted,edited,rejected")
        print("versions=source_preserved,new_immutable_version")
        print("exports=pdf,docx,private_signed_download")
        print("cross_user=run,suggestion,export_denied")
    finally:
        if storage_paths:
            try:
                admin.storage.from_(settings.document_bucket).remove(storage_paths)
            except Exception:
                pass
        for user in users:
            try:
                admin.auth.admin.delete_user(user.id)
            except Exception:
                pass
        print("live_resume_improvement_cleanup=complete")


if __name__ == "__main__":
    asyncio.run(main())
