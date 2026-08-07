from __future__ import annotations

from types import SimpleNamespace

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


def test_direct_id_update_writes_when_document_exists():
    """When field-query finds nothing, update-by-document-id still completes."""

    written: dict = {}

    class _Ref:
        def set(self, payload, merge=False):
            written["payload"] = payload
            written["merge"] = merge

    class _Snap:
        exists = True
        id = "analysis-1"

        def to_dict(self):
            return {"id": "analysis-1", "user_id": "user-1", "status": "processing"}

        @property
        def reference(self):
            return _Ref()

    class _Collection:
        def document(self, doc_id: str):
            assert doc_id == "analysis-1"
            return SimpleNamespace(get=lambda: _Snap())

    query = FirestoreQuery(_DummyClient(), "ats_analyses")  # type: ignore[arg-type]
    query.update({"status": "completed", "overall_score": 72.0})
    query.eq("id", "analysis-1").eq("user_id", "user-1")
    result = query._direct_id_update(_Collection())  # type: ignore[arg-type]

    assert result is not None
    assert result["status"] == "completed"
    assert result["overall_score"] == 72.0
    assert result["user_id"] == "user-1"
    assert written["payload"]["status"] == "completed"
    assert written["merge"] is True


def test_direct_id_update_rejects_user_mismatch():
    class _Snap:
        exists = True
        id = "analysis-1"

        def to_dict(self):
            return {"id": "analysis-1", "user_id": "other-user", "status": "processing"}

        @property
        def reference(self):
            raise AssertionError("must not write for wrong user")

    class _Collection:
        def document(self, _doc_id: str):
            return SimpleNamespace(get=lambda: _Snap())

    query = FirestoreQuery(_DummyClient(), "ats_analyses")  # type: ignore[arg-type]
    query.update({"status": "completed"})
    query.eq("id", "analysis-1").eq("user_id", "user-1")
    assert query._direct_id_update(_Collection()) is None  # type: ignore[arg-type]


def test_oversized_in_filter_is_chunked_and_deduplicated():
    class _Document:
        def __init__(self, doc_id: str):
            self.id = doc_id

        def to_dict(self):
            return {"id": self.id}

    class _Query:
        def __init__(self, values=None):
            self.values = values or []

        def where(self, *, filter):
            return _Query(filter[2])

        def stream(self):
            return [_Document(str(value)) for value in self.values]

    class _Collection:
        def where(self, *, filter):
            return _Query(filter[2])

    class _Client:
        def field_filter(self, column, operator, value):
            return (column, operator, value)

    query = FirestoreQuery(_Client(), "jobs")  # type: ignore[arg-type]
    query.in_("id", [f"job-{index}" for index in range(65)])
    query.in_("id", ["job-0", "job-64"])

    documents = query._documents(_Collection())  # type: ignore[arg-type]
    assert len(documents) == 65
    assert {document.id for document in documents} == {f"job-{index}" for index in range(65)}


def test_empty_in_filter_returns_no_documents():
    class _Collection:
        def where(self, **_kwargs):
            raise AssertionError("empty IN must not reach Firestore")

    query = FirestoreQuery(_DummyClient(), "jobs")  # type: ignore[arg-type]
    query.in_("id", [])
    assert query._documents(_Collection()) == []  # type: ignore[arg-type]
