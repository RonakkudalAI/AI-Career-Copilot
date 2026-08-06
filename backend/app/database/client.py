
from __future__ import annotations

import re
import secrets
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.core.config import Settings

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TABLES = {
    "users", "profiles", "candidate_preferences", "candidate_skills", "candidate_experiences",
    "candidate_projects", "candidate_education", "candidate_certifications", "candidate_languages",
    "candidate_links", "resumes", "resume_versions", "job_descriptions", "ats_analyses",
    "ats_evidence", "resume_suggestions", "resume_exports", "resume_improvement_runs",
    "interview_sessions", "interview_questions", "interview_responses", "interview_reports",
    "learning_paths", "learning_items", "learning_resources", "jobs", "job_recommendations",
    "saved_jobs", "notification_preferences", "privacy_preferences", "activity_events",
    "user_notifications",
}
_ID_TABLES = _TABLES - {"candidate_preferences", "notification_preferences", "privacy_preferences", "saved_jobs"}
def _identifier(value: str) -> str:
    if not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"Unsafe field identifier: {value}")
    return value
class Result:
    def __init__(self, data: list[dict[str, Any]] | None = None, count: int | None = None):
        self.data = data or []
        self.count = count
class LocalStorageObject:
    def __init__(self, settings: Settings, bucket: str):
        self.settings = settings
        self.bucket = bucket
        self.root = Path(settings.local_storage_dir).resolve() / bucket
        self.root.mkdir(parents=True, exist_ok=True)
    def _path(self, name: str) -> Path:
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Invalid storage path")
        target = (self.root / relative).resolve()
        if self.root not in target.parents and target != self.root:
            raise ValueError("Invalid storage path")
        return target
    def upload(self, path: str, content: bytes, options: dict[str, Any] | None = None) -> dict[str, Any]:
        target = self._path(path)
        if target.exists() and (options or {}).get("upsert") not in {True, "true"}:
            raise FileExistsError(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return {"path": path}
    def remove(self, paths: list[str]) -> list[dict[str, str]]:
        removed = []
        for name in paths:
            target = self._path(name)
            if target.exists() and target.is_file():
                target.unlink()
                removed.append({"name": name})
        return removed
    def list(self, prefix: str = "") -> list[dict[str, Any]]:
        base = self._path(prefix) if prefix else self.root
        if not base.exists():
            return []
        return [{"name": entry.name, "id": secrets.token_hex(8) if entry.is_file() else None,
                 "metadata": {"size": entry.stat().st_size} if entry.is_file() else {}}
                for entry in base.iterdir()]
    def create_signed_url(self, path: str, _expires: int) -> dict[str, str]:
        """Return an authenticated app-relative file URL (not a time-limited capability token).

        Access is enforced by JWT + path ownership on /api/files. The expires
        argument is accepted for API compatibility but is not enforced here.
        """
        target = self._path(path)
        if not target.is_file():
            raise FileNotFoundError(path)
        return {
            "signedURL": f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}",
            "authenticated_file_url": f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}",
        }
class LocalStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
    def from_(self, bucket: str) -> LocalStorageObject:
        return LocalStorageObject(self.settings, bucket)
class FirestoreResult(Result):
    pass


class FirestoreQuery:
    def __init__(self, client: FirestoreClient, table: str):
        self.client = client
        self.table_name = _identifier(table)
        if self.table_name not in _TABLES and self.table_name != "_setup_checks":
            raise ValueError(f"Unknown table: {table}")
        self.columns = ["*"]
        self.filters: list[tuple[str, str, Any]] = []
        self.orders: list[tuple[str, bool]] = []
        self.max_rows: int | None = None
        self.single_row = False
        self.count_requested = False
        self.head = False
        self.operation = "select"
        self.payload: Any = None

    def select(self, columns: str = "*", count: str | None = None, head: bool = False):
        parts = [column.strip() for column in columns.split(",") if column.strip()]
        for part in parts:
            if "(" in part and ")" in part:
                raise ValueError(
                    f"Unsupported nested select syntax '{part}'. "
                    "Fetch related rows with explicit queries (Firestore has no relational embeds)."
                )
        self.columns = parts or ["*"]
        self.count_requested = count == "exact"
        self.head = head
        return self

    def eq(self, column: str, value: Any): return self._filter("==", column, value)
    def neq(self, column: str, value: Any): return self._filter("!=", column, value)
    def lt(self, column: str, value: Any): return self._filter("<", column, value)
    def lte(self, column: str, value: Any): return self._filter("<=", column, value)
    def gt(self, column: str, value: Any): return self._filter(">", column, value)
    def gte(self, column: str, value: Any): return self._filter(">=", column, value)
    def in_(self, column: str, values: list[Any]): return self._filter("in", column, values)
    def is_(self, column: str, value: str):
        # Soft-delete: match documents where field is null OR missing.
        # Stored as a special filter applied client-side after stream.
        if str(value).lower() == "null":
            self.filters.append(("is_null_or_missing", _identifier(column), None))
            return self
        return self._filter("==", column, None)

    def _filter(self, operator: str, column: str, value: Any):
        self.filters.append((operator, _identifier(column), value))
        return self

    def order(self, column: str, desc: bool = False):
        self.orders.append((_identifier(column), desc))
        return self

    def limit(self, amount: int):
        self.max_rows = max(0, int(amount))
        return self
    def single(self):
        self.max_rows, self.single_row = 1, True
        return self
    def insert(self, payload):
        self.operation, self.payload = "insert", payload
        return self
    def update(self, payload):
        self.operation, self.payload = "update", payload
        return self
    def upsert(self, payload):
        self.operation, self.payload = "upsert", payload
        return self
    def delete(self):
        self.operation = "delete"
        return self

    def execute(self) -> FirestoreResult:
        collection = self.client.db.collection(self.table_name)
        if self.operation in {"insert", "upsert"}:
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            output = []
            for raw in rows:
                row = dict(raw or {})
                doc_id = str(row.get("id") or uuid.uuid4())
                row["id"] = doc_id
                if self.operation == "upsert":
                    existing = self._find_upsert_target(collection, row)
                    if existing is not None:
                        existing.reference.set(row, merge=True)
                        row = {**(existing.to_dict() or {}), **row}
                    else:
                        collection.document(doc_id).set(row)
                else:
                    collection.document(doc_id).create(row)
                output.append(row)
            return FirestoreResult(output)

        docs = self._documents(collection)
        if self.operation == "delete":
            output = []
            for document in docs:
                data = document.to_dict() or {}
                output.append({**data, "id": document.id})
                document.reference.delete()
            return FirestoreResult(output)
        if self.operation == "update":
            output = []
            for document in docs:
                document.reference.set(dict(self.payload or {}), merge=True)
                output.append({**(document.to_dict() or {}), **dict(self.payload or {}), "id": document.id})
            return FirestoreResult(output)

        data = [] if self.head else [self._project(document) for document in docs]
        count = len(docs) if self.count_requested else None
        if self.single_row:
            return FirestoreResult(data[0] if data else None, count)
        return FirestoreResult(data, count)

    def _documents(self, collection):
        query = collection
        post_filters: list[tuple[str, str, Any]] = []
        for operator, column, value in self.filters:
            if operator == "is_null_or_missing":
                post_filters.append((operator, column, value))
                continue
            query = query.where(filter=self.client.field_filter(column, operator, value))
        for column, desc in self.orders:
            query = query.order_by(column, direction=self.client.direction(desc))
        # When soft-delete is applied client-side, over-fetch then filter/limit in memory.
        fetch_limit = self.max_rows
        if post_filters and self.max_rows is not None:
            fetch_limit = max(self.max_rows * 5, 50)
        if fetch_limit is not None and not post_filters:
            query = query.limit(fetch_limit)
        elif fetch_limit is not None and post_filters:
            query = query.limit(fetch_limit)
        docs = list(query.stream())
        if post_filters:
            kept = []
            for document in docs:
                data = document.to_dict() or {}
                ok = True
                for operator, column, _value in post_filters:
                    if operator == "is_null_or_missing":
                        if column in data and data.get(column) is not None:
                            ok = False
                            break
                if ok:
                    kept.append(document)
            docs = kept
            if self.max_rows is not None:
                docs = docs[: self.max_rows]
        return docs

    def _project(self, document):
        data = document.to_dict() or {}
        data["id"] = document.id
        if "*" not in self.columns:
            data = {key: data.get(key) for key in self.columns if key in data}
            data["id"] = document.id
        return data

    def _find_upsert_target(self, collection, row):
        keys = {"user_id"} if self.table_name in {"candidate_preferences", "notification_preferences", "privacy_preferences"} else {"user_id", "job_id"} if self.table_name == "saved_jobs" else {"id"}
        query = collection
        for key in keys.intersection(row):
            query = query.where(filter=self.client.field_filter(key, "==", row[key]))
        return next(iter(query.limit(1).stream()), None)


class FirestoreClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.db = _firestore_for(settings)
        self.storage = LocalStorage(settings)

    @staticmethod
    def field_filter(column: str, operator: str, value: Any):
        from google.cloud.firestore_v1.base_query import FieldFilter
        return FieldFilter(column, operator, value)

    @staticmethod
    def direction(desc: bool):
        from google.cloud.firestore_v1 import Query as FirestoreSdkQuery
        return FirestoreSdkQuery.DESCENDING if desc else FirestoreSdkQuery.ASCENDING

    def table(self, name: str) -> FirestoreQuery: return FirestoreQuery(self, name)
    def attach_nested(self, table: str, rows: list[dict[str, Any]], columns: list[str]) -> None: return None


def _firestore_for(settings: Settings):
    from firebase_admin import firestore
    app = firebase_admin_app(settings)
    return firestore.client(app=app, database_id=settings.firebase_database_id)


def firebase_admin_app(settings: Settings):
    import firebase_admin
    from firebase_admin import credentials
    credential_path = Path(settings.firebase_credentials_path)
    if not credential_path.is_absolute():
        credential_path = (Path(__file__).resolve().parents[3] / credential_path).resolve()
    if not credential_path.is_file():
        raise RuntimeError(f"Firebase credentials file not found: {credential_path}")
    certificate = credentials.Certificate(str(credential_path))
    credential_project = getattr(certificate, "project_id", None)
    if credential_project and credential_project != settings.firebase_project_id:
        raise RuntimeError("Firebase project mismatch between FIREBASE_PROJECT_ID and service-account credentials")
    app_name = f"career-copilot-{settings.firebase_project_id}-{settings.firebase_database_id}"
    try:
        return firebase_admin.get_app(app_name)
    except ValueError:
        return firebase_admin.initialize_app(
            certificate,
            {"projectId": settings.firebase_project_id},
            name=app_name,
        )


def database_client(settings: Settings):
    if not settings.firebase_configured:
        raise RuntimeError(
            "Firestore is not configured. Set FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_PATH."
        )
    return FirestoreClient(settings)
def database_probe(settings: Settings) -> dict[str, Any]:
    try:
        database_client(settings).db.collection("_setup_checks").limit(1).stream()
        return {"status": "reachable", "configured": True, "database": settings.firebase_database_id, "engine": "firestore", "project": settings.firebase_project_id}
    except Exception as exc:
        return {"status": "unreachable", "configured": settings.database_configured, "engine": "firestore", "error": str(exc)}
