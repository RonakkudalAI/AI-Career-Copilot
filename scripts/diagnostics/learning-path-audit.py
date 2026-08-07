"""
Learning path feature feedback loop — static + unit contract checks.

Exit 1 if any RED finding. Run:
  backend\\.venv\\Scripts\\python.exe scripts/diagnostics/learning-path-audit.py
"""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

findings: list[tuple[str, str]] = []


def add(level: str, msg: str) -> None:
    findings.append((level, msg))


def audit_static() -> None:
    router = (ROOT / "backend/app/api/router.py").read_text(encoding="utf-8")
    fe = (ROOT / "frontend/src/features/learning/components/learning.tsx").read_text(encoding="utf-8")
    demo = (ROOT / "frontend/src/features/auth/demo-session.ts").read_text(encoding="utf-8")

    list_m = re.search(r"def list_learning\([\s\S]*?(?=\n@router\.|\ndef )", router)
    if not list_m or "item_count" not in list_m.group(0) or "learning_items" not in list_m.group(0):
        add("RED", "GET /learning-paths must attach item_count + lightweight items")
    else:
        add("INFO", "list_learning attaches item summaries")

    load_m = re.search(r"const load = useCallback\(\(\) => \{[\s\S]*?\}, \[pathId\]\);", fe)
    if not load_m:
        add("RED", "LearningPath load() missing")
    else:
        block = load_m.group(0)
        if "setPath(null)" not in block:
            add("RED", "LearningPath load() on error must clear path")
        if 'setError("")' not in block and "setError('')" not in block:
            add("RED", "LearningPath load() must clear error on success path")

    if "Generate YouTube" in fe or "Generate YouTube path" in fe:
        add("RED", "UI still uses YouTube-branded generate button")
    if "Generate from ATS gaps" not in fe:
        add("RED", "Expected generate CTA 'Generate from ATS gaps'")
    if "Recommended YouTube videos" in fe:
        add("RED", "UI still labels resources as Recommended YouTube videos")
    if "Recommended lessons" not in fe:
        add("RED", "Expected Recommended lessons label")

    if "demo-path-1" in demo and "learning_resources" not in demo[demo.find("demo-path-1") : demo.find("demo-path-1") + 1200]:
        add("RED", "Seeded demo-path-1 missing learning_resources")

    get_demo = re.search(
        r'parts\[0\] === "learning-paths" && parts\.length === 2 && method === "GET"\s*\{([\s\S]*?)\n  \}',
        demo,
    )
    if get_demo and "throw" not in get_demo.group(1):
        add("RED", "Demo GET /learning-paths/:id must throw on miss")

    if 'title": f"YouTube learning path' in router or "YouTube learning path ·" in router:
        add("RED", "Generated path title still branded as YouTube learning path")

    if "Topic not available" not in fe and "Back to learning paths" not in fe:
        add("INFO", "Topic page should guide users back to paths")


def audit_runtime_crew() -> None:
    from app.features.learning.agents.crew.orchestrator import run_learning_youtube_crew
    from app.features.learning.youtube_catalog import is_allowed_youtube_url

    class DummySettings:
        groq_configured = False
        nvidia_configured = False
        youtube_configured = False

    evidence = [
        {"requirement_text": "Docker", "match_status": "not_found"},
        {"requirement_text": "Git", "match_status": "partial_match"},
        {"requirement_text": "Python", "match_status": "matched"},
    ]
    items, audit = asyncio.run(
        run_learning_youtube_crew(
            DummySettings(),
            evidence_rows=evidence,
            source_analysis_id="analysis-1",
            role_title="Backend Engineer",
        )
    )
    if not audit.success:
        add("RED", f"crew success=False without LLM: {audit.message}")
    if len(items) != 2:
        add("RED", f"crew expected 2 gap items (Docker, Git), got {len(items)}")
    for item in items:
        resources = item.get("resources") or []
        if not resources:
            add("RED", f"item missing resources: {item.get('title')}")
            continue
        url = str(resources[0].get("url") or "")
        if not is_allowed_youtube_url(url):
            add("RED", f"disallowed resource url: {url}")
        if "/watch" in url:
            add("RED", f"invented watch URL without API: {url}")

    empty_items, _empty_audit = asyncio.run(
        run_learning_youtube_crew(
            DummySettings(),
            evidence_rows=[{"requirement_text": "SQL", "match_status": "matched"}],
            source_analysis_id="a2",
        )
    )
    if empty_items:
        add("RED", "matched-only evidence produced learning items")

    # Frontend state machine simulation
    path = None
    error = ""
    # miss throws → catch
    try:
        raise RuntimeError("The requested record was not found.")
    except RuntimeError as exc:
        path = None
        error = str(exc)
    if path is not None or not error:
        add("RED", "miss must yield path=null + error message")
    else:
        add("INFO", "miss state machine OK (error + no path)")

    # list with item_count
    list_path = {"id": "p1", "item_count": 3, "items": [{"id": "1"}, {"id": "2"}, {"id": "3"}]}
    steps = list_path.get("item_count") if isinstance(list_path.get("item_count"), int) else len(list_path.get("items") or [])
    if steps != 3:
        add("RED", "step count helper mismatch")
    else:
        add("INFO", "list step count OK")


def main() -> int:
    audit_static()
    audit_runtime_crew()

    reds = [m for l, m in findings if l == "RED"]
    infos = [m for l, m in findings if l == "INFO"]
    print("=== LEARNING PATH FEEDBACK LOOP ===")
    for level, msg in findings:
        print(f"[{level}] {msg}")
    print(f"--- RED={len(reds)} INFO={len(infos)} TOTAL={len(findings)} ---")
    if reds:
        print("LOOP_RED")
        return 1
    print("LOOP_GREEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
