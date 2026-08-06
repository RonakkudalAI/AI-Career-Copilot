"""Firestore order_by(created_at) drops docs missing the field — client sort must not."""

from app.database.repository import row_recency_key, sort_rows_by_recency


def test_sort_prefers_started_at_when_created_at_missing():
    rows = [
        {"id": "old", "started_at": "2026-01-01T00:00:00+00:00", "status": "completed"},
        {"id": "new", "started_at": "2026-08-06T22:00:00+00:00", "status": "completed"},
        {"id": "mid", "completed_at": "2026-06-01T00:00:00+00:00", "status": "completed"},
    ]
    ordered = sort_rows_by_recency(rows, desc=True, preferred="created_at")
    assert [row["id"] for row in ordered] == ["new", "mid", "old"]


def test_sort_does_not_drop_rows_without_timestamps():
    rows = [
        {"id": "a", "status": "completed"},
        {"id": "b", "started_at": "2026-08-01T00:00:00+00:00"},
    ]
    ordered = sort_rows_by_recency(rows, desc=True)
    assert len(ordered) == 2
    assert ordered[0]["id"] == "b"
    assert ordered[1]["id"] == "a"


def test_row_recency_key_uses_fallbacks():
    assert row_recency_key({"completed_at": "2026-01-02"}).startswith("1:")
    assert row_recency_key({"id": "x"}).startswith("0:")
