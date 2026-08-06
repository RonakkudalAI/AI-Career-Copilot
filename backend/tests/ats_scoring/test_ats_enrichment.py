"""ATS list/detail must show which resume + JD were used, even for broken rows."""

from __future__ import annotations

from types import SimpleNamespace

from app.api import router
from app.core.errors import ApiError


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self.store = store
        self.table = table
        self.filters: list[tuple[str, object]] = []
        self.orders: list[tuple[str, bool]] = []
        self.lim: int | None = None

    def select(self, _columns="*"):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, column, desc=False):
        self.orders.append((column, desc))
        return self

    def limit(self, amount):
        self.lim = amount
        return self

    def execute(self):
        rows = [dict(item) for item in self.store.get(self.table, [])]
        for key, value in self.filters:
            rows = [row for row in rows if str(row.get(key)) == str(value)]
        if self.orders:
            column, desc = self.orders[0]
            rows = sorted(rows, key=lambda row: row.get(column) or "", reverse=desc)
        if self.lim is not None:
            rows = rows[: self.lim]
        return _Result(rows)


class _Client:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Query(self.store, name)


def _user():
    return SimpleNamespace(id="u1")


def _store(**overrides):
    base = {
        "ats_analyses": [
            {
                "id": "a1",
                "user_id": "u1",
                "resume_version_id": "v1",
                "job_description_id": "j1",
                "status": "completed",
                "overall_score": 80,
                "created_at": "2026-01-02T00:00:00Z",
            }
        ],
        "resume_versions": [
            {
                "id": "v1",
                "user_id": "u1",
                "resume_id": "r1",
                "version_number": 2,
                "original_filename": "cv.pdf",
                "created_at": "2026-01-01T00:00:00Z",
                "extraction_status": "confirmed",
                "plain_text": "hello",
                "structured_content": {"sections": {"skills": ["Python"]}},
            }
        ],
        "resumes": [
            {
                "id": "r1",
                "user_id": "u1",
                "title": "My Resume",
                "deleted_at": None,
            }
        ],
        "job_descriptions": [
            {
                "id": "j1",
                "user_id": "u1",
                "title": "Backend Engineer",
                "company": "Acme",
                "role_title": "Backend",
                "input_type": "text",
                "original_filename": None,
                "created_at": "2026-01-01T00:00:00Z",
                "extraction_status": "confirmed",
                "raw_text": "need python",
                "structured_content": {},
            }
        ],
    }
    base.update(overrides)
    return base


def test_enrich_attaches_resume_and_job_used():
    client = _Client(_store())
    out = router._enrich_ats_analysis(client, _user(), _store()["ats_analyses"][0])
    assert out["resume"]["title"] == "My Resume"
    assert out["resume"]["original_filename"] == "cv.pdf"
    assert out["resume"]["version_number"] == 2
    assert out["resume"]["unavailable"] is False
    assert out["job_description"]["title"] == "Backend Engineer"
    assert out["job_description"]["company"] == "Acme"
    assert out["job_description"]["unavailable"] is False


def test_enrich_survives_missing_foreign_keys():
    """One incomplete analysis must not raise (would wipe ATS history UI)."""
    row = {"id": "a-bad", "user_id": "u1", "status": "failed", "created_at": "2026-01-03"}
    out = router._enrich_ats_analysis(_Client(_store()), _user(), row)
    assert out["resume"]["unavailable"] is True
    assert out["job_description"]["unavailable"] is True
    assert "unavailable" in out["resume"]["title"].lower() or out["resume"]["title"]


def test_enrich_keeps_filename_when_parent_resume_missing():
    store = _store(resumes=[])
    out = router._enrich_ats_analysis(_Client(store), _user(), store["ats_analyses"][0])
    assert out["resume"]["unavailable"] is True
    assert out["resume"]["original_filename"] == "cv.pdf"
    assert out["resume"]["version_number"] == 2


def test_list_ats_does_not_drop_good_rows_when_one_is_corrupt(monkeypatch):
    store = _store(
        ats_analyses=[
            {
                "id": "a1",
                "user_id": "u1",
                "resume_version_id": "v1",
                "job_description_id": "j1",
                "status": "completed",
                "overall_score": 80,
                "created_at": "2026-01-02T00:00:00Z",
            },
            {
                "id": "a2",
                "user_id": "u1",
                "status": "failed",
                "overall_score": None,
                "created_at": "2026-01-03T00:00:00Z",
            },
        ]
    )
    client = _Client(store)
    user = _user()
    settings = SimpleNamespace()

    monkeypatch.setattr(router, "client_for", lambda _settings, _user: client)
    monkeypatch.setattr(router, "get_current_user", lambda: user)

    # Call the route function directly (Depends already resolved via kwargs pattern).
    rows = router.list_ats(user=user, settings=settings)
    assert len(rows) == 2
    by_id = {row["id"]: row for row in rows}
    assert by_id["a1"]["resume"]["original_filename"] == "cv.pdf"
    assert by_id["a1"]["job_description"]["title"] == "Backend Engineer"
    assert by_id["a2"]["resume"]["unavailable"] is True
    assert by_id["a2"]["job_description"]["unavailable"] is True
