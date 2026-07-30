"""Opt-in live NVIDIA-to-Supabase resume workflow using temporary synthetic data."""

import asyncio
import os
import uuid
from datetime import UTC, datetime

import httpx
from supabase import ClientOptions, create_client

from app.config import get_settings
from app.main import app
from app.supabase_clients import create_admin_supabase_client

STRUCTURED = {
    "schema_version": "resume-extraction-v1",
    "sections": {
        "summary": ["Backend engineer building reliable APIs with Python and FastAPI."],
        "skills": ["Python, FastAPI, PostgreSQL"],
        "experience": ["Built internal APIs with FastAPI for 20 users in 2025."],
    },
    "unclassified_blocks": ["Temporary NVIDIA Audit Candidate"],
    "warnings": [],
    "corrections": {},
}


async def main() -> None:
    if os.getenv("RUN_NVIDIA_LIVE_TESTS") != "1":
        raise SystemExit("Set RUN_NVIDIA_LIVE_TESTS=1 to explicitly enable this external-provider test.")
    settings = get_settings()
    admin = create_admin_supabase_client(settings)
    suffix = uuid.uuid4().hex
    password = f"Audit-{suffix}-A1!"
    user = None
    storage_paths: list[str] = []
    try:
        created = admin.auth.admin.create_user(
            {
                "email": f"nvidia-resume-audit-{suffix}@example.invalid",
                "password": password,
                "email_confirm": True,
            }
        )
        user = created.user
        session = (
            create_client(settings.supabase_url, settings.supabase_publishable_key)
            .auth.sign_in_with_password({"email": user.email, "password": password})
            .session
        )
        candidate = create_client(
            settings.supabase_url,
            settings.supabase_publishable_key,
            options=ClientOptions(headers={"Authorization": f"Bearer {session.access_token}"}),
        )
        candidate.postgrest.auth(session.access_token)

        resume_id, version_id, job_id = (str(uuid.uuid4()) for _ in range(3))
        candidate.table("resumes").insert(
            {"id": resume_id, "user_id": user.id, "title": "Temporary NVIDIA audit", "is_active": True}
        ).execute()
        candidate.table("resume_versions").insert(
            {
                "id": version_id,
                "resume_id": resume_id,
                "user_id": user.id,
                "version_number": 1,
                "source_type": "uploaded",
                "original_filename": "nvidia-audit.docx",
                "storage_path": f"{user.id}/audit/source.docx",
                "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "size_bytes": 1,
                "sha256": "0" * 64,
                "plain_text": "Temporary NVIDIA audit resume",
                "structured_content": STRUCTURED,
                "extraction_status": "confirmed",
                "candidate_confirmed_at": datetime.now(UTC).isoformat(),
            }
        ).execute()
        candidate.table("job_descriptions").insert(
            {
                "id": job_id,
                "user_id": user.id,
                "input_type": "text",
                "title": "Temporary backend role",
                "company": "Audit Company",
                "role_title": "Backend Engineer",
                "raw_text": (
                    "Seeking a backend engineer with Python, FastAPI, PostgreSQL, "
                    "and reliable API experience."
                ),
                "structured_content": {"requirements": ["Python", "FastAPI", "PostgreSQL", "Reliable APIs"]},
                "extraction_status": "confirmed",
                "candidate_confirmed_at": datetime.now(UTC).isoformat(),
            }
        ).execute()

        transport = httpx.ASGITransport(app=app)
        headers = {"Authorization": f"Bearer {session.access_token}"}
        async with httpx.AsyncClient(transport=transport, base_url="http://audit", timeout=180) as api:
            generated = await api.post(
                "/api/v1/resume-improvements",
                headers=headers,
                json={
                    "resume_version_id": version_id,
                    "job_description_id": job_id,
                    "ats_analysis_id": None,
                    "section_keys": ["summary", "experience", "skills"],
                },
            )
            assert generated.status_code == 201, generated.text
            payload = generated.json()
            assert payload["run"]["status"] == "completed"
            suggestions = payload["suggestions"]
            assert len(suggestions) >= 3, "The live provider returned fewer than three safe suggestions."

            decisions = [
                {"decision": "accepted", "candidate_text": None, "candidate_confirmed": False},
                {
                    "decision": "edited",
                    "candidate_text": suggestions[1]["original_text"],
                    "candidate_confirmed": True,
                },
                {"decision": "rejected", "candidate_text": None, "candidate_confirmed": False},
            ]
            for suggestion, decision in zip(suggestions[:3], decisions, strict=True):
                response = await api.patch(
                    f"/api/v1/resume-suggestions/{suggestion['id']}", headers=headers, json=decision
                )
                assert response.status_code == 200, response.text
            for suggestion in suggestions[3:]:
                response = await api.patch(
                    f"/api/v1/resume-suggestions/{suggestion['id']}",
                    headers=headers,
                    json={"decision": "rejected", "candidate_text": None, "candidate_confirmed": False},
                )
                assert response.status_code == 200, response.text

            applied = await api.post(
                f"/api/v1/resume-improvements/{payload['run']['id']}/apply", headers=headers
            )
            assert applied.status_code == 201, applied.text
            improved = applied.json()["resume_version"]
            storage_paths.append(improved["storage_path"])
            assert improved["created_from_version_id"] == version_id
            original = (
                candidate.table("resume_versions")
                .select("structured_content")
                .eq("id", version_id)
                .single()
                .execute()
                .data
            )
            assert original["structured_content"] == STRUCTURED

        print("nvidia_resume_improvement=pass")
        print(f"validated_suggestions={len(suggestions)}")
        print("decisions=accepted,edited,rejected")
        print("version=source_preserved,new_immutable_version")
    finally:
        if storage_paths:
            try:
                admin.storage.from_(settings.document_bucket).remove(storage_paths)
            except Exception:
                pass
        if user:
            try:
                admin.auth.admin.delete_user(user.id)
            except Exception:
                pass
        print("nvidia_resume_improvement_cleanup=complete")


if __name__ == "__main__":
    asyncio.run(main())
