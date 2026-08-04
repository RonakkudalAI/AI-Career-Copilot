"""Local end-to-end smoke against a running API (no secrets printed)."""

from __future__ import annotations

import json
import subprocess
import uuid
from pathlib import Path
from urllib import error, request

BASE = "http://127.0.0.1:8000/api/v1"
PDF = Path(__file__).resolve().parents[2] / ".data" / "audit-resume.pdf"


def req(method: str, path: str, data=None, token: str | None = None):
    url = BASE + path
    headers: dict[str, str] = {}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    http = request.Request(url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(http, timeout=180) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        err = exc.read().decode()
        raise SystemExit(f"HTTP {exc.code} {path}: {err[:800]}") from exc


def upload_resume(token: str) -> dict:
    if not PDF.is_file():
        raise SystemExit(f"missing test pdf: {PDF}")
    cmd = [
        "curl.exe",
        "-s",
        "-X",
        "POST",
        f"{BASE}/resumes",
        "-H",
        f"Authorization: Bearer {token}",
        "-F",
        f"file=@{PDF};type=application/pdf",
        "-F",
        "title=Audit Resume",
    ]
    out = subprocess.check_output(cmd, text=True)
    return json.loads(out)


def main() -> None:
    email = f"flow_{uuid.uuid4().hex[:8]}@example.com"
    password = "AuditPass123!"
    signup = req("POST", "/auth/sign-up", {"email": email, "password": password, "full_name": "Flow User"})
    token = signup["access_token"]
    print("signup_ok")

    resume = upload_resume(token)
    version = resume.get("version") or resume.get("latest_version") or {}
    vid = version.get("id")
    print("resume_version", bool(vid), "extraction", version.get("extraction_status"))
    if not vid:
        raise SystemExit(json.dumps(resume)[:500])

    conf = req("POST", f"/resume-versions/{vid}/confirm", {}, token=token)
    print("resume_confirmed", conf.get("extraction_status"))

    jd = req(
        "POST",
        "/job-descriptions",
        {
            "title": "Backend Engineer",
            "company": "Acme",
            "role_title": "Backend Engineer",
            "raw_text": "We need Docker, Python, PostgreSQL, FastAPI, Kubernetes. Build APIs and deploy with Docker.",
        },
        token=token,
    )
    jdc = req("POST", f"/job-descriptions/{jd['id']}/confirm", {}, token=token)
    print("jd_confirmed", jdc.get("extraction_status"))

    ats = req(
        "POST",
        "/ats-analyses",
        {"resume_version_id": vid, "job_description_id": jd["id"]},
        token=token,
    )
    print("ats", ats.get("status"), "score", ats.get("overall_score"))

    learn = req("POST", "/learning-paths/generate", {}, token=token)
    items = learn.get("items") or []
    print("learning_items", len(items), "algo", learn.get("algorithm_version"))
    if items:
        resources = items[0].get("learning_resources") or []
        url = (resources[0] or {}).get("url") if resources else None
        print("learning_resource_ok", bool(url and "youtube.com" in url))

    sess = req(
        "POST",
        "/interviews",
        {"target_role": "Backend Engineer", "mode": "technical", "question_count": 2},
        token=token,
    )
    start = req("POST", f"/interviews/{sess['id']}/start", {}, token=token)
    print("interview_questions", len(start.get("questions") or []), "provider", start.get("question_provider"))

    bootstrap = req("GET", "/me/bootstrap", token=token)
    print("bootstrap_ok", "workspace" in bootstrap)
    print("PASS_WORKFLOW")


if __name__ == "__main__":
    main()
