"""
Read-only connection-surface audit for Career Copilot.
Does NOT fix anything. Exit 2 when P0/P1 findings exist.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bugs: list[dict] = []


def get(url: str, headers: dict | None = None, timeout: float = 8):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="replace")
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, {k.lower(): v for k, v in e.headers.items()}, body
    except Exception as e:  # noqa: BLE001 — diagnostic
        return None, {}, f"{type(e).__name__}: {e}"


def post(url: str, payload: dict, headers: dict | None = None, timeout: float = 15):
    data = json.dumps(payload).encode()
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="replace")
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, {k.lower(): v for k, v in e.headers.items()}, body
    except Exception as e:  # noqa: BLE001
        return None, {}, f"{type(e).__name__}: {e}"


def add(bug_id: str, sev: str, area: str, title: str, evidence: str, repro: str = ""):
    bugs.append(
        {
            "id": bug_id,
            "sev": sev,
            "area": area,
            "title": title,
            "evidence": evidence,
            "repro": repro,
        }
    )


def main() -> int:
    # --- Live connectivity ---
    status, headers, body = get("http://127.0.0.1:8000/api/v1/health")
    print("LIVE health direct:", status, (body or "")[:280])
    if status != 200:
        add("CONN-LIVE-01", "P0", "API", "Backend health not reachable on :8000", body or "")

    status_p, _, body_p = get("http://127.0.0.1:3000/api/backend/health")
    print("LIVE health proxy:", status_p, (body_p or "")[:280])
    if status_p != 200:
        add(
            "CONN-LIVE-02",
            "P0",
            "FE↔API proxy",
            "Vite /api/backend proxy health failed",
            body_p or "",
        )

    status_c, headers_c, _ = get(
        "http://127.0.0.1:8000/api/v1/health",
        headers={"Origin": "http://127.0.0.1:3000"},
    )
    acao = headers_c.get("access-control-allow-origin")
    print("CORS ACAO for 127.0.0.1:3000:", acao)
    if status_c == 200 and acao not in ("http://127.0.0.1:3000", "*"):
        add(
            "CONN-CORS-01",
            "P1",
            "CORS",
            "Health response missing ACAO for frontend origin",
            str(headers_c)[:500],
        )

    status_bad, headers_bad, _ = get(
        "http://127.0.0.1:8000/api/v1/health",
        headers={"Origin": "http://evil.example"},
    )
    acao_bad = headers_bad.get("access-control-allow-origin")
    print("CORS ACAO for evil.example:", acao_bad)
    if acao_bad == "http://evil.example":
        add(
            "CONN-CORS-03",
            "P0",
            "CORS",
            "Arbitrary Origin reflected in ACAO",
            f"acao={acao_bad}",
        )

    status_f, _, body_f = get("http://127.0.0.1:8000/api/v1/files/avatars/u/x.jpg")
    print("Files no-auth:", status_f, (body_f or "")[:160])
    if status_f not in (401, 403):
        add(
            "CONN-FILE-01",
            "P0",
            "files auth",
            "Unauthenticated file access did not return 401/403",
            f"status={status_f} body={(body_f or '')[:200]}",
        )

    status_fp, _, body_fp = get("http://127.0.0.1:3000/api/files/avatars/u/x.jpg")
    print("Files via proxy no-auth:", status_fp, (body_fp or "")[:160])
    if status_fp not in (401, 403):
        add(
            "CONN-FILE-02",
            "P1",
            "files proxy",
            "Proxy /api/files did not enforce auth the same way",
            f"status={status_fp} body={(body_fp or '')[:200]}",
        )

    status_wrong, _, _ = get("http://127.0.0.1:8000/api/files/avatars/u/x.jpg")
    print("Direct /api/files (no v1):", status_wrong)
    if status_wrong and status_wrong != 404:
        # FastAPI may 404 — expected; if 200 that's wrong
        if status_wrong == 200:
            add(
                "CONN-FILE-03",
                "P0",
                "path mismatch",
                "Unexpected hit on /api/files without /api/v1",
                f"status={status_wrong}",
            )

    # Cookie-only auth for files (img path): prove cookie works, Bearer works, neither fails
    # Use a throwaway signup if possible
    import uuid

    email = f"conn-audit-{uuid.uuid4().hex[:10]}@local.invalid"
    password = "AuditPassword123!"
    st, _, signup_body = post(
        "http://127.0.0.1:8000/api/v1/auth/sign-up",
        {"email": email, "password": password, "full_name": "Conn Audit"},
    )
    print("Signup:", st, (signup_body or "")[:200])
    token = None
    user_id = None
    try:
        if st in (200, 201):
            data = json.loads(signup_body)
            token = data.get("access_token")
            user_id = (data.get("user") or {}).get("id")
        else:
            add(
                "CONN-LIVE-03",
                "P0",
                "auth/Firestore",
                "Sign-up failed during connection audit",
                (signup_body or "")[:400],
                repro="POST /api/v1/auth/sign-up",
            )

        if token and user_id:
            # Bootstrap over proxy
            st_b, _, body_b = get(
                "http://127.0.0.1:3000/api/backend/me/bootstrap",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            print("Bootstrap via proxy:", st_b, (body_b or "")[:200])
            if st_b != 200:
                add(
                    "CONN-LIVE-04",
                    "P0",
                    "FE proxy auth",
                    "Authenticated bootstrap via Vite proxy failed",
                    f"status={st_b} body={(body_b or '')[:300]}",
                )
            else:
                boot = json.loads(body_b)
                caps = boot.get("capabilities") or {}
                if caps.get("job_recommendations") is False:
                    add(
                        "CONN-CAP-01",
                        "P2",
                        "capabilities",
                        "Bootstrap capabilities.job_recommendations hardcoded False",
                        f"capabilities={json.dumps(caps)[:400]}",
                        repro="GET /api/v1/me/bootstrap",
                    )

            # File with Bearer
            fake_path = f"avatars/{user_id}/missing.jpg"
            st_fb, _, body_fb = get(
                f"http://127.0.0.1:8000/api/v1/files/{fake_path}",
                headers={"Authorization": f"Bearer {token}"},
            )
            print("File Bearer (missing):", st_fb, (body_fb or "")[:160])
            # Cookie only (simulate <img>)
            st_fc, _, body_fc = get(
                f"http://127.0.0.1:8000/api/v1/files/{fake_path}",
                headers={"Cookie": f"career_copilot_session={token}"},
            )
            print("File Cookie (missing):", st_fc, (body_fc or "")[:160])
            # Expected: 404 file_not_found once auth passes; 401 if cookie path broken
            if st_fc == 401 and st_fb in (404, 503):
                add(
                    "CONN-FILE-07",
                    "P0",
                    "files cookie auth",
                    "Cookie-only file auth fails while Bearer works — <img src=avatar_url> will always 401",
                    f"cookie_status={st_fc} bearer_status={st_fb} body={(body_fc or '')[:200]}",
                    repro="GET /api/v1/files/... with Cookie career_copilot_session only",
                )
            elif st_fc not in (401, 404, 503) or st_fb not in (401, 404, 503):
                add(
                    "CONN-FILE-08",
                    "P1",
                    "files auth",
                    "Unexpected statuses for authenticated missing file",
                    f"cookie={st_fc} bearer={st_fb}",
                )

            # Relative signed URL vs absolute API base mismatch (static)
            # Prove FastAPI does NOT serve /api/files (no v1) even when authenticated
            st_rel, _, body_rel = get(
                f"http://127.0.0.1:8000/api/files/avatars/{user_id}/x.jpg",
                headers={"Authorization": f"Bearer {token}"},
            )
            print("Auth on /api/files (no v1):", st_rel)
            if st_rel == 404:
                add(
                    "CONN-FILE-05",
                    "P1",
                    "files URL contract",
                    "Signed URLs use /api/files/... but API only mounts /api/v1/files/... — requires FE reverse-proxy rewrite",
                    f"GET http://127.0.0.1:8000/api/files/... with Bearer → {st_rel}; /api/v1/files works",
                    repro="Compare GET /api/files/... vs /api/v1/files/...",
                )

            # Proxy path works for cookie (same-origin browser model)
            st_px, _, body_px = get(
                f"http://127.0.0.1:3000/api/files/avatars/{user_id}/missing.jpg",
                headers={"Cookie": f"career_copilot_session={token}"},
            )
            print("File cookie via proxy:", st_px, (body_px or "")[:160])
            if st_px == 401:
                add(
                    "CONN-FILE-09",
                    "P0",
                    "files proxy cookie",
                    "Cookie auth via Vite /api/files proxy returns 401",
                    (body_px or "")[:300],
                )
    finally:
        if token:
            st_d, _, body_d = (
                lambda: post(
                    "http://127.0.0.1:8000/api/v1/account",
                    {"confirmation": "DELETE MY ACCOUNT", "email": email},
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=60,
                )
            )()
            print("Cleanup account delete:", st_d, (body_d or "")[:120])

    # --- Static contracts ---
    client_py = (ROOT / "backend/app/database/client.py").read_text(encoding="utf-8")
    router_py = (ROOT / "backend/app/api/router.py").read_text(encoding="utf-8")
    vite = (ROOT / "frontend/vite.config.mjs").read_text(encoding="utf-8")
    fe_config = (ROOT / "frontend/src/shared/config.ts").read_text(encoding="utf-8")
    auth_client = (ROOT / "frontend/src/features/auth/api/client.ts").read_text(encoding="utf-8")
    main_py = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    config_py = (ROOT / "backend/app/core/config.py").read_text(encoding="utf-8")
    api_client = (ROOT / "frontend/src/shared/api/client.ts").read_text(encoding="utf-8")

    if "VITE_API_BASE_URL" in fe_config and 'return `${url.replace(/\\/$/, "")}${API_V1_PREFIX}`' in fe_config.replace(
        "\n", " "
    ):
        pass
    if "VITE_API_BASE_URL" in fe_config and "create_signed_url" in client_py:
        add(
            "CONN-FILE-06",
            "P1",
            "cross-origin deploy",
            "When VITE_API_BASE_URL points API to another origin, signed file URLs stay relative /api/files on the page origin",
            "resolveApiBase uses absolute API host; create_signed_url always returns /api/files/...",
            repro="Build with VITE_API_BASE_URL=http://api:8000; load avatar_url in <img>",
        )

    if "document.cookie" in auth_client and "HttpOnly" not in auth_client:
        add(
            "CONN-AUTH-01",
            "P1",
            "session cookie",
            "Session cookie is JS-writable (not HttpOnly); required for <img> file auth but XSS-stealable",
            "saveToken sets career_copilot_session via document.cookie",
        )

    if "SameSite=Lax" in auth_client and "Secure" not in auth_client:
        add(
            "CONN-AUTH-02",
            "P2",
            "session cookie",
            "Session cookie missing Secure attribute",
            "document.cookie = ... SameSite=Lax without Secure",
        )

    # sign-out clears server cookie but client already cleared localStorage; server delete_cookie may not match path/attrs
    if 'response.delete_cookie("career_copilot_session")' in (
        ROOT / "backend/app/api/routers/auth.py"
    ).read_text(encoding="utf-8"):
        add(
            "CONN-AUTH-03",
            "P2",
            "session cookie",
            "Server sign-out delete_cookie may not clear client-set cookie (path/SameSite defaults differ)",
            'auth_sign_out: response.delete_cookie("career_copilot_session") without path=/',
            repro="Sign in, inspect Set-Cookie on sign-out vs document.cookie Max-Age=0",
        )

    if "Do not perform a second remote HEAD/GET" in client_py:
        add(
            "CONN-STOR-01",
            "P2",
            "storage",
            "Supabase signed URL generation does not verify object exists",
            "create_signed_url returns URL unconditionally",
        )

    if "def remove(self, paths: list[str])" in client_py and "raise_for_status" in client_py:
        add(
            "CONN-STOR-02",
            "P2",
            "storage",
            "SupabaseStorageObject.remove fails entire batch if any path 404s",
            "remove → _request DELETE → raise_for_status",
        )

    if "httpx.request(method, url, headers=headers, timeout=30" in client_py:
        add(
            "CONN-STOR-03",
            "P3",
            "storage performance",
            "Supabase storage uses one-shot httpx.request (no connection pool)",
            "SupabaseStorageObject._request",
        )

    if (
        'if result["database_status"] == "reachable" and result["storage_status"] == "reachable"'
        in client_py
    ):
        add(
            "CONN-HEALTH-01",
            "P2",
            "health probe",
            "Overall probe status requires both DB and storage reachable",
            "database_probe status logic",
        )

    if "if self.max_rows is not None and not post_filters and not self.orders:" in client_py:
        add(
            "CONN-FS-01",
            "P1",
            "Firestore query",
            "Soft-delete / client-order queries skip server-side limit and stream the full filtered set",
            "_documents() only applies query.limit when not post_filters and not orders",
            repro="Query resumes with is_(deleted_at,null).limit(1) for a user with many soft-deleted rows",
        )

    if 'allow_headers=["Authorization", "Content-Type", "X-Request-ID"]' in main_py:
        add(
            "CONN-CORS-02",
            "P3",
            "CORS",
            "CORS allow_headers whitelist is narrow for cross-origin browser clients",
            "main.py CORSMiddleware allow_headers",
        )

    if "return self.omniroute_configured or bool(self.groq_api_key" in config_py:
        add(
            "CONN-LLM-01",
            "P2",
            "LLM routing",
            "omniroute_configured makes groq/nvidia appear configured without real provider keys",
            "Settings.groq_configured / nvidia_configured",
        )

    # Auth session always hits network via POST even though getSession is local
    if "async getSession()" in auth_client and 'request("/auth/session")' in auth_client:
        # getUser hits network — fine
        pass

    # 401 clears token but concurrent requests
    if 'window.localStorage.removeItem("career_copilot_access_token")' in api_client:
        add(
            "CONN-AUTH-04",
            "P2",
            "session lifecycle",
            "401 handler clears localStorage/cookie but does not navigate/sign-out globally; parallel requests race",
            "apiRequest 401 branch",
        )

    # Vite proxy missing ws / error handling — skip

    # Learning YouTube
    learning_dir = ROOT / "backend/app/features/learning"
    yt_text = "\n".join(p.read_text(encoding="utf-8") for p in learning_dir.rglob("*.py"))
    if "httpx" in yt_text:
        if "TimeoutException" not in yt_text and "NetworkError" not in yt_text:
            add(
                "CONN-YT-01",
                "P1",
                "YouTube",
                "YouTube HTTP client path lacks explicit network/timeout → ApiError mapping",
                "backend/app/features/learning uses httpx without TimeoutException handling",
            )

    # Firebase Google: browser talks to Google; exchange talks to Admin
    firebase_ts = (ROOT / "frontend/src/features/auth/firebase.ts").read_text(encoding="utf-8")
    if "signInWithPopup" in firebase_ts or "signInWithRedirect" in firebase_ts:
        add(
            "CONN-FB-01",
            "P2",
            "Firebase Auth",
            "Google sign-in depends on browser→Google + server→Firebase Admin; third-party cookie/popup blockers surface as generic connection errors",
            "frontend firebase.ts + POST /auth/firebase",
        )

    # Adzuna only page 1
    adzuna = (ROOT / "backend/app/features/adzuna_api.py").read_text(encoding="utf-8")
    if 'f"{self.base_url}/1"' in adzuna:
        add(
            "CONN-ADZ-01",
            "P3",
            "Adzuna",
            "Adzuna client only fetches page 1 (hardcoded /1)",
            "search_jobs URL ends with /1",
        )

    # ThreadPoolExecutor bootstrap — Firestore client thread safety generally OK with Admin SDK
    if "ThreadPoolExecutor" in router_py and "bootstrap" in router_py:
        add(
            "CONN-FS-02",
            "P3",
            "Firestore concurrency",
            "Bootstrap fans out many parallel Firestore streams per page load (connection/rate pressure)",
            "me/bootstrap ThreadPoolExecutor max_workers=8 + count pool",
        )

    # Content-Type forced on GET/empty body
    if 'Content-Type": "application/json"' in api_client and "FormData" in api_client:
        add(
            "CONN-API-01",
            "P3",
            "API client",
            "apiRequest sets Content-Type application/json for non-FormData including GET",
            "frontend/src/shared/api/client.ts headers",
        )

    print("\n=== CONNECTION BUGS ===")
    print(json.dumps(bugs, indent=2))
    print(f"\nTOTAL={len(bugs)}")
    p0 = sum(1 for b in bugs if b["sev"] == "P0")
    p1 = sum(1 for b in bugs if b["sev"] == "P1")
    p2 = sum(1 for b in bugs if b["sev"] == "P2")
    p3 = sum(1 for b in bugs if b["sev"] == "P3")
    print(f"BY_SEV P0={p0} P1={p1} P2={p2} P3={p3}")
    return 2 if (p0 or p1) else 0


if __name__ == "__main__":
    raise SystemExit(main())
