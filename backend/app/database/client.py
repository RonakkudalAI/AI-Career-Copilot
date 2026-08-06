
from __future__ import annotations

import re
import secrets
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import Settings

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_BUCKET = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
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


def _bucket_name(value: str) -> str:
    cleaned = (value or "").strip()
    if not _BUCKET.fullmatch(cleaned):
        raise ValueError(f"Unsafe storage bucket name: {value}")
    return cleaned
class Result:
    def __init__(self, data: list[dict[str, Any]] | None = None, count: int | None = None):
        self.data = data or []
        self.count = count
def _safe_object_key(name: str) -> str:
    relative = Path(name)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid storage path")
    cleaned = "/".join(part for part in relative.as_posix().split("/") if part and part != ".")
    if not cleaned:
        raise ValueError("Invalid storage path")
    return cleaned


class FirebaseStorageObject:
    """Object store backed by Firebase Storage (GCS) under a logical bucket prefix."""

    def __init__(self, settings: Settings, logical_bucket: str):
        self.settings = settings
        self.bucket = _bucket_name(logical_bucket)

    def _object_path(self, path: str) -> str:
        return f"{self.bucket}/{_safe_object_key(path)}"

    def _gcs_bucket(self):
        from firebase_admin import storage as firebase_storage

        app = firebase_admin_app(self.settings)
        name = self.settings.resolved_firebase_storage_bucket
        if not name:
            raise RuntimeError(
                "Firebase Storage is not configured. Set FIREBASE_STORAGE_BUCKET "
                "(for example your-project.appspot.com)."
            )
        # Must pass the named Admin app — this project never uses the default app.
        return firebase_storage.bucket(name, app=app)

    def upload(self, path: str, content: bytes, options: dict[str, Any] | None = None) -> dict[str, Any]:
        object_path = self._object_path(path)
        blob = self._gcs_bucket().blob(object_path)
        if blob.exists() and (options or {}).get("upsert") not in {True, "true"}:
            raise FileExistsError(path)
        content_type = (options or {}).get("content-type") or (options or {}).get("content_type")
        blob.upload_from_string(content, content_type=content_type)
        return {"path": path}

    def download(self, path: str) -> bytes:
        blob = self._gcs_bucket().blob(self._object_path(path))
        if not blob.exists():
            raise FileNotFoundError(path)
        return blob.download_as_bytes()

    def remove(self, paths: list[str]) -> list[dict[str, str]]:
        removed: list[dict[str, str]] = []
        bucket = self._gcs_bucket()
        for name in paths:
            blob = bucket.blob(self._object_path(name))
            if blob.exists():
                blob.delete()
                removed.append({"name": name})
        return removed

    def list(self, prefix: str = "") -> list[dict[str, Any]]:
        bucket = self._gcs_bucket()
        base = self.bucket if not prefix else f"{self.bucket}/{_safe_object_key(prefix)}"
        search = f"{base}/"
        iterator = bucket.list_blobs(prefix=search, delimiter="/")
        items: list[dict[str, Any]] = []
        for blob in iterator:
            rel = blob.name[len(search) :] if blob.name.startswith(search) else blob.name
            if not rel or "/" in rel:
                continue
            items.append(
                {
                    "name": rel,
                    "id": secrets.token_hex(8),
                    "metadata": {"size": int(blob.size or 0)},
                }
            )
        for folder in getattr(iterator, "prefixes", []) or []:
            rel = folder[len(search) :].rstrip("/") if folder.startswith(search) else folder.rstrip("/")
            if rel and "/" not in rel:
                items.append({"name": rel, "id": None, "metadata": {}})
        return items

    def create_signed_url(self, path: str, expires: int) -> dict[str, str]:
        """Return authenticated app file URL; bytes live in Firebase Storage.

        Browser access stays on /api/files so ownership is enforced with the app JWT.
        The expires argument is retained for API compatibility; access is session-gated.
        """
        blob = self._gcs_bucket().blob(self._object_path(path))
        if not blob.exists():
            raise FileNotFoundError(path)
        url = f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}"
        return {"signedURL": url, "authenticated_file_url": url, "expires_in": int(expires)}


class SupabaseStorageObject:
    """Private Supabase Storage bucket used through the server-side service role."""

    def __init__(self, settings: Settings, logical_bucket: str):
        self.settings = settings
        self.bucket = _bucket_name(logical_bucket)
        self.storage_bucket = _bucket_name(settings.supabase_storage_bucket)

    def _url(self, path: str = "") -> str:
        key = f"{self.bucket}/{_safe_object_key(path)}" if path else self.bucket
        return f"{self.settings.resolved_supabase_url}/storage/v1/object/{self.storage_bucket}/{quote(key, safe='/')}"

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        headers = {
            "apikey": self.settings.supabase_service_role_key,
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
            **(kwargs.pop("headers", {}) or {}),
        }
        response = httpx.request(method, url, headers=headers, timeout=30, **kwargs)
        if response.status_code == 404:
            raise FileNotFoundError(url)
        response.raise_for_status()
        return response

    def upload(self, path: str, content: bytes, options: dict[str, Any] | None = None) -> dict[str, Any]:
        content_type = (options or {}).get("content-type") or (options or {}).get("content_type")
        headers = {"Content-Type": content_type or "application/octet-stream"}
        if (options or {}).get("upsert") in {True, "true"}:
            headers["x-upsert"] = "true"
        self._request("POST", self._url(path), content=content, headers=headers)
        return {"path": path}

    def download(self, path: str) -> bytes:
        return self._request("GET", self._url(path)).content

    def remove(self, paths: list[str]) -> list[dict[str, str]]:
        removed: list[dict[str, str]] = []
        for path in paths:
            self._request("DELETE", self._url(path))
            removed.append({"name": path})
        return removed

    def list(self, prefix: str = "") -> list[dict[str, Any]]:
        """Paginate Supabase Storage list (limit 1000 per page) until exhausted."""
        base_prefix = f"{self.bucket}/{_safe_object_key(prefix)}" if prefix else self.bucket
        items: list[dict[str, Any]] = []
        offset = 0
        page_size = 1000
        while True:
            response = self._request(
                "POST",
                f"{self.settings.resolved_supabase_url}/storage/v1/object/list/{self.storage_bucket}",
                json={"prefix": base_prefix, "limit": page_size, "offset": offset},
            )
            page = response.json() or []
            if not isinstance(page, list):
                break
            items.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        return items

    def create_signed_url(self, path: str, expires: int) -> dict[str, str]:
        self._request("GET", self._url(path))
        url = f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}"
        return {"signedURL": url, "authenticated_file_url": url, "expires_in": int(expires)}


class MemoryStorageObject:
    """In-process object store for automated tests only (APP_ENV=test)."""

    _STORE: dict[str, dict[str, bytes]] = {}

    def __init__(self, settings: Settings, logical_bucket: str):
        self.settings = settings
        self.bucket = _bucket_name(logical_bucket)
        self._STORE.setdefault(self.bucket, {})

    def upload(self, path: str, content: bytes, options: dict[str, Any] | None = None) -> dict[str, Any]:
        key = _safe_object_key(path)
        bucket = self._STORE[self.bucket]
        if key in bucket and (options or {}).get("upsert") not in {True, "true"}:
            raise FileExistsError(path)
        bucket[key] = content
        return {"path": path}

    def download(self, path: str) -> bytes:
        key = _safe_object_key(path)
        try:
            return self._STORE[self.bucket][key]
        except KeyError as exc:
            raise FileNotFoundError(path) from exc

    def remove(self, paths: list[str]) -> list[dict[str, str]]:
        removed: list[dict[str, str]] = []
        bucket = self._STORE[self.bucket]
        for name in paths:
            key = _safe_object_key(name)
            if key in bucket:
                del bucket[key]
                removed.append({"name": name})
        return removed

    def list(self, prefix: str = "") -> list[dict[str, Any]]:
        base = _safe_object_key(prefix) if prefix else ""
        items: list[dict[str, Any]] = []
        children: set[str] = set()
        for key, content in self._STORE[self.bucket].items():
            if base and not (key == base or key.startswith(base + "/")):
                continue
            rest = key[len(base) :].lstrip("/") if base else key
            if not rest:
                continue
            head = rest.split("/", 1)[0]
            if head in children:
                continue
            children.add(head)
            if "/" in rest:
                items.append({"name": head, "id": None, "metadata": {}})
            else:
                items.append({"name": head, "id": secrets.token_hex(8), "metadata": {"size": len(content)}})
        return items

    def create_signed_url(self, path: str, expires: int) -> dict[str, str]:
        self.download(path)
        url = f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}"
        return {"signedURL": url, "authenticated_file_url": url, "expires_in": int(expires)}


class ObjectStorage:
    """Object storage facade.

    - APP_ENV=test → in-memory (no network)
    - Firebase configured → Firebase Storage (GCS)  [product default]
    - else Supabase Storage service-role (legacy fallback)
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._memory = str(settings.app_env).lower() == "test"

    def from_(self, bucket: str) -> FirebaseStorageObject | SupabaseStorageObject | MemoryStorageObject:
        if self._memory:
            return MemoryStorageObject(self.settings, bucket)
        if self.settings.supabase_storage_configured:
            return SupabaseStorageObject(self.settings, bucket)
        raise RuntimeError(
            "Supabase Storage is not configured. Set SUPABASE_URL, "
            "SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET."
        )


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
        # Soft-delete (is_null_or_missing) is applied client-side. Never apply a
        # server-side limit before that filter — soft-deleted docs would consume
        # the window and hide live rows (e.g. the one active resume among many deleted).
        if self.max_rows is not None and not post_filters:
            query = query.limit(self.max_rows)
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
        self.storage = ObjectStorage(settings)

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
    options: dict[str, str] = {"projectId": settings.firebase_project_id}
    storage_bucket = settings.resolved_firebase_storage_bucket
    if storage_bucket:
        options["storageBucket"] = storage_bucket
    try:
        return firebase_admin.get_app(app_name)
    except ValueError:
        return firebase_admin.initialize_app(certificate, options, name=app_name)


def database_client(settings: Settings):
    if not settings.firebase_configured:
        raise RuntimeError(
            "Firestore is not configured. Set FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_PATH."
        )
    return FirestoreClient(settings)


def database_probe(settings: Settings) -> dict[str, Any]:
    storage_engine = "supabase_storage" if settings.supabase_storage_configured else "unconfigured"
    storage_bucket = settings.supabase_storage_bucket or None
    result: dict[str, Any] = {
        "status": "unreachable",
        "configured": settings.database_configured,
        "database": settings.firebase_database_id,
        "engine": "firestore",
        "project": settings.firebase_project_id or None,
        "storage_bucket": storage_bucket,
        "storage_engine": storage_engine,
        "database_status": "unreachable",
        "storage_status": "unreachable",
    }
    try:
        database_client(settings).db.collection("_setup_checks").limit(1).stream()
        result["database_status"] = "reachable"
    except Exception as exc:
        result["database_error"] = str(exc)
    try:
        if not settings.storage_configured:
            raise RuntimeError("Object storage is not configured")
        ObjectStorage(settings).from_(settings.document_bucket).list("_setup_checks")
        result["storage_status"] = "reachable"
    except Exception as exc:
        result["storage_error"] = str(exc)
    if result["database_status"] == "reachable" and result["storage_status"] == "reachable":
        result["status"] = "reachable"
    return result
