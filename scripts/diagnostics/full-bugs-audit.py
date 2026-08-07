"""
Full-project bug audit (read-only). Exit 2 if P0/P1 findings.
Does not print secrets.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bugs: list[dict] = []


def add(sev: str, area: str, title: str, evidence: str, repro: str = "") -> None:
    bugs.append(
        {
            "sev": sev,
            "area": area,
            "title": title,
            "evidence": evidence[:500],
            "repro": repro,
        }
    )


def http(
    method: str,
    path: str,
    token: str | None = None,
    payload: dict | None = None,
    base: str = "http://127.0.0.1:8000",
    timeout: float = 45,
):
    data = None if payload is None else json.dumps(payload).encode()
    headers: dict[str, str] = {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            return r.status, round((time.perf_counter() - t0) * 1000), body
    except urllib.error.HTTPError as e:
        return e.code, round((time.perf_counter() - t0) * 1000), e.read().decode()
    except Exception as e:  # noqa: BLE001
        return None, round((time.perf_counter() - t0) * 1000), f"{type(e).__name__}: {e}"


def static_scan() -> None:
    client_py = (ROOT / "backend/app/database/client.py").read_text(encoding="utf-8")
    router = (ROOT / "backend/app/api/router.py").read_text(encoding="utf-8")
    auth = (ROOT / "backend/app/features/auth/service.py").read_text(encoding="utf-8")
    config_ts = (ROOT / "frontend/src/shared/config.ts").read_text(encoding="utf-8")
    flow = (ROOT / "frontend/src/features/interview/components/interview-flow.tsx").read_text(
        encoding="utf-8"
    )
    api_client = (ROOT / "frontend/src/shared/api/client.ts").read_text(encoding="utf-8")
    auth_client = (ROOT / "frontend/src/features/auth/api/client.ts").read_text(encoding="utf-8")
    ats = (ROOT / "backend/app/features/ats/ats_score.py").read_text(encoding="utf-8")
    main_py = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")

    if "if self.max_rows is not None and not post_filters and not self.orders:" in client_py:
        add(
            "P1",
            "Firestore logic",
            "Soft-delete / client-order queries skip server-side limit (full collection stream)",
            "_documents only applies query.limit when not post_filters and not orders",
            "Query with is_(deleted_at,null).limit(1)",
        )

    if '"job_recommendations": False' in router:
        add(
            "P2",
            "Capabilities",
            "Bootstrap capabilities.job_recommendations hard-coded False",
            "me/bootstrap capabilities block",
        )

    if '.order("position")' in router:
        add(
            "P2",
            "Interview/DB",
            "Interview questions use server-side order(position); Firestore omits docs missing the field",
            "get_interview / start_interview .order('position')",
        )

    if 'table("users")' in auth:
        add(
            "P2",
            "Auth/DB",
            "Every authenticated request queries users collection (latency on every API call)",
            "_user_from_token",
        )

    if "VITE_API_BASE_URL" in config_ts and "BROWSER_API_PROXY_PREFIX" in config_ts:
        add(
            "P1",
            "FE/API deploy",
            "Absolute VITE_API_BASE_URL for JSON but signed file URLs stay relative /api/files",
            "resolveApiBase vs create_signed_url",
        )

    if re.search(r"audio:\s*true|audio:\s*flags\.microphone", flow):
        add(
            "P0",
            "Interview voice",
            "getUserMedia still requests audio (can block SpeechRecognition)",
            "interview-flow media effect",
        )

    if "seen: set[tuple[str, str]]" in ats and "def _candidate_terms" in ats:
        # only flag if active path still has tuple seen
        add_fn = ats[ats.find("def _candidate_terms") : ats.find("def _aliases")]
        if "seen: set[tuple[str, str]]" in add_fn or "key = (canonical, kind)" in add_fn:
            add(
                "P1",
                "ATS logic",
                "ATS term dedupe still keys by (term, kind) allowing double-count",
                "_candidate_terms seen set",
            )

    if "if not evaluation and answer:" in router:
        add(
            "P2",
            "Interview logic",
            "Report rebuild re-evaluates answers without duration_seconds (pace lost for incomplete evals)",
            "_create_interview_report",
        )

    if '.in_("id", job_ids)' in router or ".in_('id', job_ids)" in router:
        add(
            "P1",
            "Jobs API",
            "saved-jobs / job-recommendations use unchunked Firestore in_ (fails at >30 ids)",
            "list_saved_jobs / list_job_recommendations",
        )

    # Scan all in_ sites
    for p in (ROOT / "backend/app").rglob("*.py"):
        text = p.read_text(encoding="utf-8")
        lines = text.splitlines()
        for i, line in enumerate(lines, 1):
            if ".in_(" not in line:
                continue
            window = "\n".join(lines[max(0, i - 6) : i])
            rel = str(p.relative_to(ROOT)).replace("\\", "/")
            if "chunk" in window.lower() or "for batch" in window.lower():
                continue
            if any(
                k in line
                for k in (
                    "job_ids",
                    "item_ids",
                    "analysis_ids",
                    "stale_ids",
                    'in_("id"',
                    "in_('id'",
                    "in_(\"learning_item_id\"",
                    "in_('learning_item_id'",
                    "in_(\"analysis_id\"",
                    "in_('analysis_id'",
                )
            ):
                guarded = bool(re.search(r"if\s+\w+", window))
                add(
                    "P1" if not guarded else "P2",
                    "Firestore in_",
                    f"Unchunked in_ at {rel}:{i}",
                    line.strip()[:140],
                    "Firestore IN max 30; empty array errors",
                )

    if "create_signed_url" in client_py and 'url = f"/api/files/' in client_py:
        add(
            "P1",
            "Files URL",
            "Signed file URLs use /api/files while FastAPI mounts /api/v1/files (needs reverse proxy)",
            "SupabaseStorageObject.create_signed_url",
        )

    if "document.cookie" in auth_client and "HttpOnly" not in auth_client:
        add(
            "P1",
            "Session cookie",
            "Session cookie set from JS (not HttpOnly); required for img file auth but XSS-stealable",
            "auth saveToken",
        )

    if "SameSite=Lax" in auth_client and "Secure" not in auth_client:
        add(
            "P2",
            "Session cookie",
            "Session cookie missing Secure attribute",
            "document.cookie SameSite=Lax only",
        )

    if 'window.localStorage.removeItem("career_copilot_access_token")' in api_client:
        add(
            "P2",
            "Session lifecycle",
            "401 clears storage/cookie but does not force global sign-out/navigation",
            "apiRequest 401 branch",
        )

    if "return self.omniroute_configured or bool(self.groq_api_key" in (
        ROOT / "backend/app/core/config.py"
    ).read_text(encoding="utf-8"):
        add(
            "P2",
            "LLM routing",
            "omniroute_configured makes groq/nvidia appear configured without real keys",
            "Settings.groq_configured",
        )

    # Flow: complete after only some answers still marks completed
    if 'update({"status": "completed"' in router:
        add(
            "P2",
            "Interview flow",
            "complete_interview marks session completed even if unanswered questions remain",
            "POST /interviews/{id}/complete has no answered-all guard",
        )

    # Dual path scoring service vs ats_score
    scoring_svc = ROOT / "backend/app/features/ats/scoring/service.py"
    if scoring_svc.is_file():
        add(
            "P3",
            "ATS architecture",
            "Two ATS scoring paths exist (ats_score.py keyword coverage vs scoring/service pipeline)",
            "Potential product confusion if both routes active",
        )

    # CORS narrow headers
    if 'allow_headers=["Authorization", "Content-Type", "X-Request-ID"]' in main_py:
        add(
            "P3",
            "CORS",
            "CORS allow_headers whitelist is explicit (usually OK; Starlette may expand simple headers)",
            "main.py CORSMiddleware",
        )

    # Demo session incomplete report fields risk already mitigated - skip

    # Firestore insert without created_at on questions
    if '"position": index' in router and "interview_questions" in router:
        if "created_at" not in router[router.find("for index, item in enumerate(questions_payload") : router.find("if rows:")]:
            # soft finding
            pass


def firestore_contracts() -> None:
    try:
        from app.core.config import get_settings
        from app.database.client import database_client
    except Exception as e:  # noqa: BLE001
        add("P1", "DB import", "Could not import database client", str(e)[:200])
        return

    try:
        settings = get_settings()
        if not settings.firebase_configured:
            add(
                "P1",
                "DB config",
                "Firestore not configured in environment",
                "firebase_configured=False",
            )
            return
        client = database_client(settings)
    except Exception as e:  # noqa: BLE001
        add("P0", "DB connect", "database_client failed", str(e)[:250])
        return

    try:
        client.table("jobs").select("id").in_("id", []).execute()
        add("P1", "Firestore", "empty in_ unexpectedly succeeded", "should error")
    except Exception as e:  # noqa: BLE001
        add(
            "P1",
            "Firestore",
            "empty in_ hard-fails (unguarded call sites return 500)",
            str(e)[:200],
            "table.in_('id', [])",
        )

    try:
        client.table("jobs").select("id").in_("id", [f"x{i}" for i in range(31)]).execute()
        add("P1", "Firestore", "in_ with 31 values unexpectedly succeeded", "should error")
    except Exception as e:  # noqa: BLE001
        add(
            "P1",
            "Firestore",
            "in_ >30 values hard-fails without chunking in app layer",
            str(e)[:200],
            "in_ 31 ids",
        )

    try:
        client.table("jobs").select("id").in_("id", [f"x{i}" for i in range(30)]).execute()
    except Exception as e:  # noqa: BLE001
        add("P1", "Firestore", "in_ with 30 values failed (unexpected)", str(e)[:200])


def live_api() -> None:
    st, ms, body = http("GET", "/api/v1/health", timeout=5)
    print("health", st, ms, (body or "")[:160])
    if st is None:
        add(
            "P0",
            "Live stack",
            "Backend not reachable on :8000 (dev servers down)",
            body,
            "curl http://127.0.0.1:8000/api/v1/health",
        )
        st_p, _, body_p = http("GET", "/health", base="http://127.0.0.1:3000/api/backend", timeout=5)
        if st_p is None:
            add(
                "P0",
                "Live stack",
                "Frontend proxy not reachable on :3000",
                body_p,
                "curl http://127.0.0.1:3000/api/backend/health",
            )
        return

    st_p, _, body_p = http("GET", "/health", base="http://127.0.0.1:3000/api/backend", timeout=5)
    if st_p != 200:
        add("P0", "FE proxy", "Vite /api/backend proxy health failed", f"{st_p} {body_p[:200]}")

    email = f"diag-{uuid.uuid4().hex[:10]}@local.invalid"
    st, ms, body = http(
        "POST",
        "/api/v1/auth/sign-up",
        payload={"email": email, "password": "AuditPassword123!", "full_name": "Diag"},
    )
    print("signup", st, ms)
    if st not in (200, 201):
        add("P0", "Auth/API", "sign-up failed", body[:300])
        return
    data = json.loads(body)
    token = data["access_token"]
    uid = data["user"]["id"]

    st, ms, body = http("GET", "/api/v1/me/bootstrap", token=token, timeout=60)
    print("bootstrap", st, ms)
    if st != 200:
        add("P0", "API", "bootstrap failed", f"{st} {body[:250]}")
    elif ms > 5000:
        add("P2", "Perf", "bootstrap slow", f"{ms}ms")

    # Interview full flow
    st, ms, body = http(
        "POST",
        "/api/v1/interviews",
        token=token,
        payload={
            "mode": "mixed",
            "target_role": "Backend Engineer",
            "question_count": 2,
            "job_description_text": "Required: Python, FastAPI, Docker.",
            "difficulty": "balanced",
            "duration_minutes": 15,
            "camera_enabled": True,
            "microphone_enabled": True,
            "recording_consent": False,
        },
    )
    print("interview create", st, ms)
    sid = None
    if st not in (200, 201):
        add("P0", "Interview API", "create interview failed", f"{st} {body[:300]}")
    else:
        sid = json.loads(body)["id"]
        st, ms, body = http("POST", f"/api/v1/interviews/{sid}/start", token=token, timeout=90)
        print("interview start", st, ms)
        if st != 200:
            add("P0", "Interview API", "start failed", f"{st} {body[:300]}")
        else:
            qs = json.loads(body).get("questions") or []
            if not qs:
                add("P0", "Interview flow", "start returned zero questions", body[:250])
            else:
                st, ms, body = http(
                    "POST",
                    f"/api/v1/interviews/{sid}/responses",
                    token=token,
                    payload={
                        "question_id": qs[0]["id"],
                        "typed_response": (
                            "Recently I owned a production latency issue. "
                            "I profiled the API, fixed N+1 queries, and reduced p95 from 2s to 400ms."
                        ),
                        "transcript": (
                            "Recently I owned a production latency issue. "
                            "I profiled the API, fixed N+1 queries, and reduced p95 from 2s to 400ms."
                        ),
                        "duration_seconds": 25,
                        "speech_metrics": {
                            "duration_seconds": 25,
                            "words_per_minute": 120,
                            "filler_count": 0,
                            "word_count": 28,
                        },
                    },
                    timeout=90,
                )
                print("response", st, ms)
                if st not in (200, 201):
                    add("P0", "Interview API", "submit response failed", f"{st} {body[:300]}")
                else:
                    ev = json.loads(body).get("evaluation") or {}
                    if "speaking_delivery" not in ev:
                        add(
                            "P1",
                            "Interview logic",
                            "evaluation missing speaking_delivery",
                            str(list(ev.keys())),
                        )
                    st, ms, body = http(
                        "POST", f"/api/v1/interviews/{sid}/complete", token=token, timeout=120
                    )
                    print("complete", st, ms)
                    if st != 200:
                        add("P0", "Interview API", "complete failed", f"{st} {body[:300]}")
                    else:
                        report = json.loads(body).get("report") or {}
                        rbody = report.get("report") if isinstance(report.get("report"), dict) else report
                        if not (rbody or {}).get("practice_readiness"):
                            add(
                                "P1",
                                "Interview flow",
                                "complete report missing practice_readiness in nested report body",
                                str(list((rbody or report).keys())[:25]),
                            )

        if sid:
            http("DELETE", f"/api/v1/interviews/{sid}", token=token)

    st, ms, body = http(
        "PATCH", "/api/v1/profile", token=token, payload={"headline": "diag"}, timeout=60
    )
    print("patch profile", st, ms)
    if st == 200 and ms > 8000:
        add(
            "P2",
            "Perf",
            "profile PATCH very slow (auth + multi Firestore completion reads)",
            f"{ms}ms",
        )

    st, _, _ = http("GET", "/api/files/avatars/x/y.jpg", token=token)
    st2, _, _ = http("GET", f"/api/v1/files/avatars/{uid}/missing.jpg", token=token)
    print("files", st, st2)
    if st == 404 and st2 in (404, 503, 401):
        add(
            "P1",
            "Files URL",
            "Direct /api/files 404s; app relies on FE proxy rewrite to /api/v1/files",
            f"/api/files={st} /api/v1/files={st2}",
        )

    st, ms, body = http(
        "DELETE",
        "/api/v1/account",
        token=token,
        payload={"confirmation": "DELETE MY ACCOUNT", "email": email},
        timeout=120,
    )
    print("account delete", st, ms)
    if st not in (200, 204):
        add("P1", "Account", "account delete failed", f"{st} {body[:200]}")


def main() -> int:
    print("=== STATIC ===")
    static_scan()
    print("=== FIRESTORE CONTRACTS ===")
    firestore_contracts()
    print("=== LIVE API ===")
    live_api()

    # Deduplicate similar titles
    seen: set[str] = set()
    unique: list[dict] = []
    for b in bugs:
        key = f"{b['sev']}|{b['area']}|{b['title']}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(b)

    print("\n=== FINDINGS ===")
    print(json.dumps(unique, indent=2))
    c = Counter(b["sev"] for b in unique)
    print(f"\nTOTAL={len(unique)} BY_SEV={dict(c)}")
    return 2 if c.get("P0") or c.get("P1") else 0


if __name__ == "__main__":
    # Ensure backend imports resolve
    sys.path.insert(0, str(ROOT / "backend"))
    raise SystemExit(main())
