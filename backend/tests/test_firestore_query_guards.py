from __future__ import annotations

import pytest

from app.database.client import FirestoreQuery


class _DummyClient:
    def field_filter(self, *args, **kwargs):
        raise AssertionError("should not run")


def test_nested_select_syntax_is_rejected():
    query = FirestoreQuery(_DummyClient(), "saved_jobs")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="Unsupported nested select"):
        query.select("*,jobs(*)")


def test_is_null_or_missing_filter_recorded():
    query = FirestoreQuery(_DummyClient(), "resumes")  # type: ignore[arg-type]
    query.is_("deleted_at", "null")
    assert query.filters[0][0] == "is_null_or_missing"
    assert query.filters[0][1] == "deleted_at"
