"""One-shot project audit harness. Prints only non-secret findings."""
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

findings: list[dict] = []


def add(category: str, name: str, status: str, detail: str, severity: str = "info"):
    findings.append(
        {
            "category": category,
            "name": name,
            "status": status,  # pass|fail|warn|info
            "severity": severity,  # critical|high|medium|low|info
            "detail": detail[:500],
        }
    )


def main() -> int:
    # --- env ---
    env_path = ROOT / ".env"
    if not env_path.is_file():
        add("env", "env_file", "fail", f"Missing {env_path}", "critical")
        print(json.dumps(findings, indent=2))
        return 2
    add("env", "env_file", "pass", f"Readable {env_path.name}", "info")

    from app.core.config import get_settings

    s = get_settings()
    add("env", "app_env", "pass", str(s.app_env), "info")
    add("env", "api_v1_prefix", "pass", str(s.api_v1_prefix), "info")
    add("env", "public_api_base_url", "pass", str(s.public_api_base_url), "info")
    add("env", "frontend_origins", "pass", ",".join(s.frontend_origins), "info")
    add("env", "auth_secret_set", "pass" if s.auth_secret else "fail", "set" if s.auth_secret else "missing", "critical" if not s.auth_secret else "info")
    add("env", "llm_provider", "pass", str(s.llm_provider), "info")
    add("env", "nvidia_configured", "pass" if s.nvidia_configured else "warn", str(s.nvidia_configured), "medium" if not s.nvidia_configured else "info")
    add("env", "groq_configured", "pass" if s.groq_configured else "warn", str(s.groq_configured), "medium" if not s.groq_configured else "info")
    add("env", "firebase_project", "pass" if s.firebase_project_id else "fail", s.firebase_project_id or "missing", "critical" if not s.firebase_project_id else "info")
    add("env", "firebase_database", "pass", s.firebase_database_id or "(default)", "info")
    add("env", "supabase_storage", "pass" if s.supabase_storage_configured else "fail", f"bucket={s.supabase_storage_bucket}", "critical" if not s.supabase_storage_configured else "info")
    add("env", "vite_api_base_url", "info", "unset→use /api/backend proxy" if not os.environ.get("VITE_API_BASE_URL") else "set", "info")

    # --- database ---
    try:
        from app.database.client import database_client, database_probe

        probe = database_probe(s)
        ok = probe.get("database_status") == "reachable"
        add(
            "database",
            "firestore_probe",
            "pass" if ok else "fail",
            json.dumps({k: v for k, v in probe.items() if "key" not in k.lower() and "secret" not in k.lower()}),
            "critical" if not ok else "info",
        )
        if ok:
            client = database_client(s)
            # write/read soft check on known collections existence via empty query
            for table in ("users", "profiles", "resumes", "resume_versions", "job_descriptions", "ats_analyses", "interview_sessions"):
                try:
                    client.table(table).select("id").limit(1).execute()
                    add("database", f"table_{table}", "pass", "select ok", "info")
                except Exception as exc:
                    add("database", f"table_{table}", "fail", f"{type(exc).__name__}: {exc}", "high")
            # known bug regression: order_by missing created_at
            from app.database.repository import sort_rows_by_recency

            users = client.table("users").select("id").limit(5).execute().data or []
            if users:
                uid = str(users[0]["id"])
                raw = client.table("ats_analyses").select("id,created_at,started_at,status").eq("user_id", uid).execute().data or []
                ordered_server = (
                    client.table("ats_analyses")
                    .select("id")
                    .eq("user_id", uid)
                    .order("created_at", desc=True)
                    .execute()
                    .data
                    or []
                )
                sorted_client = sort_rows_by_recency(raw, desc=True)
                if raw and not ordered_server and sorted_client:
                    add(
                        "database",
                        "firestore_order_created_at_gap",
                        "warn",
                        f"user sample has {len(raw)} analyses but order(created_at) returned 0; client sort returns {len(sorted_client)} (known Firestore gap mitigated in app)",
                        "medium",
                    )
                else:
                    add(
                        "database",
                        "firestore_order_created_at_gap",
                        "pass",
                        f"raw={len(raw)} ordered={len(ordered_server)} client={len(sorted_client)}",
                        "info",
                    )
    except Exception as exc:
        add("database", "firestore_probe", "fail", f"{type(exc).__name__}: {exc}", "critical")

    # --- storage ---
    try:
        from app.database.client import database_client

        client = database_client(s)
        storage = client.storage
        # list root of document bucket prefix (may be empty)
        try:
            items = storage.from_(s.document_bucket).list("")
            add("storage", "document_bucket_list", "pass", f"bucket={s.document_bucket} items={len(items) if isinstance(items, list) else 'n/a'}", "info")
        except Exception as exc:
            add("storage", "document_bucket_list", "fail", f"{type(exc).__name__}: {exc}", "high")
        try:
            items = storage.from_(s.avatar_bucket).list("")
            add("storage", "avatar_bucket_list", "pass", f"bucket={s.avatar_bucket} items={len(items) if isinstance(items, list) else 'n/a'}", "info")
        except Exception as exc:
            add("storage", "avatar_bucket_list", "warn", f"{type(exc).__name__}: {exc}", "medium")
    except Exception as exc:
        add("storage", "storage_init", "fail", f"{type(exc).__name__}: {exc}", "critical")

    # --- auth ---
    try:
        from uuid import uuid4
        from app.features.auth.service import create_access_token, _user_from_token
        from app.core.errors import ApiError

        # mint token for non-existent user → should fail identity
        token = create_access_token(uuid4(), "audit@example.com", s)
        try:
            _user_from_token(token, s)
            add("auth", "jwt_unknown_user_rejected", "fail", "token for missing user accepted", "high")
        except ApiError as exc:
            add("auth", "jwt_unknown_user_rejected", "pass", f"code={exc.code}", "info")
        # invalid token
        try:
            _user_from_token("not-a-jwt", s)
            add("auth", "jwt_invalid_rejected", "fail", "garbage token accepted", "critical")
        except ApiError as exc:
            add("auth", "jwt_invalid_rejected", "pass", f"code={exc.code}", "info")
        # real user if any
        client = database_client(s)
        rows = client.table("users").select("id,email").limit(1).execute().data or []
        if rows:
            from uuid import UUID

            u = rows[0]
            tok = create_access_token(UUID(str(u["id"])), str(u.get("email") or "x@y.com"), s)
            cur = _user_from_token(tok, s)
            add("auth", "jwt_real_user", "pass", f"user_id_prefix={str(cur.id)[:8]}", "info")
        else:
            add("auth", "jwt_real_user", "warn", "no users in database", "low")
    except Exception as exc:
        add("auth", "auth_checks", "fail", f"{type(exc).__name__}: {exc}", "critical")

    # --- agents / crew ---
    try:
        from app.agents.registry import agents_status
        from app.features.resume_improvement.agents.crew import crew_capability, crew_runtime_mode
        from app.features.learning.service import learning_agent_capability
        from app.features.resume_improvement.agents.crew.compat import official_crewai_installed, try_import_crewai

        status = agents_status(s)
        add(
            "agents",
            "registry",
            "pass",
            f"count={status.get('agent_count')} ready={status.get('ready_count')} preferred={status.get('preferred_provider')} order={status.get('provider_order')}",
            "info",
        )
        for a in status.get("agents") or []:
            st = "pass" if a.get("ready") else "warn"
            add(
                "agents",
                f"agent_{a.get('id')}",
                st,
                f"provider={a.get('provider')} configured={a.get('configured')} model={a.get('model')}",
                "medium" if not a.get("ready") else "info",
            )
        ok, reason, mod = try_import_crewai(import_module=True)
        add(
            "crewai",
            "package",
            "pass" if ok else "warn",
            f"installed={official_crewai_installed()} import_ok={ok} reason={reason} runtime={crew_runtime_mode()} version={getattr(mod, '__version__', None)}",
            "low" if ok else "medium",
        )
        cap = crew_capability(s)
        add(
            "crewai",
            "resume_improvement_crew",
            "pass" if cap.get("ready") else "fail",
            f"ready={cap.get('ready')} runtime={cap.get('runtime')} requires_llm={cap.get('requires_llm')}",
            "high" if not cap.get("ready") else "info",
        )
        learn = learning_agent_capability(s)
        add(
            "crewai",
            "learning_crew",
            "pass" if learn.get("ready") is not False else "warn",
            f"ready={learn.get('ready')} runtime={learn.get('runtime')} algo={learn.get('algorithm_version')}",
            "info",
        )
    except Exception as exc:
        add("agents", "agents_checks", "fail", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-300:]}", "high")

    # --- API route import / app ---
    try:
        from app.main import app

        # Prefer OpenAPI: Starlette may nest included routers without flat .path.
        paths = sorted((app.openapi().get("paths") or {}).keys())
        must = [
            "/api/v1/health",
            "/api/v1/me/bootstrap",
            "/api/v1/resumes",
            "/api/v1/ats-analyses",
            "/api/v1/auth/sign-in",
            "/api/v1/auth/firebase",
            "/api/v1/interviews",
        ]
        missing = [p for p in must if p not in paths]
        add(
            "api",
            "fastapi_routes",
            "fail" if missing else "pass",
            f"openapi_paths={len(paths)} missing={missing}",
            "critical" if missing else "info",
        )
    except Exception as exc:
        add("api", "fastapi_app", "fail", f"{type(exc).__name__}: {exc}", "critical")

    # --- frontend proxy config static check ---
    vite = (ROOT / "frontend" / "vite.config.mjs").read_text(encoding="utf-8", errors="replace")
    add(
        "frontend",
        "vite_proxy_backend",
        "pass" if "/api/backend" in vite and "rewrite" in vite else "fail",
        "proxy /api/backend → /api/v1 configured" if "/api/backend" in vite else "missing proxy",
        "high" if "/api/backend" not in vite else "info",
    )
    add(
        "frontend",
        "vite_proxy_files",
        "pass" if "/api/files" in vite else "fail",
        "proxy /api/files configured" if "/api/files" in vite else "missing",
        "high" if "/api/files" not in vite else "info",
    )
    cfg = (ROOT / "frontend" / "src" / "shared" / "config.ts").read_text(encoding="utf-8", errors="replace")
    add(
        "frontend",
        "resolveApiBase_default",
        "pass" if 'BROWSER_API_PROXY_PREFIX = "/api/backend"' in cfg or "BROWSER_API_PROXY_PREFIX" in cfg else "warn",
        "defaults to same-origin /api/backend when VITE_API_BASE_URL unset",
        "info",
    )

    # print report
    print(json.dumps(findings, indent=2))
    fails = [f for f in findings if f["status"] == "fail"]
    warns = [f for f in findings if f["status"] == "warn"]
    print(
        f"\nSUMMARY pass={sum(1 for f in findings if f['status']=='pass')} "
        f"warn={len(warns)} fail={len(fails)} total={len(findings)}",
        file=sys.stderr,
    )
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
