"""SQLite database and local file-storage boundary for the application."""

from __future__ import annotations

import json
import re
import secrets
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.core.config import Settings
from app.core.constants import SQLITE_BUSY_TIMEOUT_MS, SQLITE_CONNECT_TIMEOUT_SECONDS

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
        raise ValueError(f"Unsafe SQL identifier: {value}")
    return value


def _value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _decode(value: Any) -> Any:
    if isinstance(value, str) and value[:1] in {"{", "["}:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            pass
    return value


def _rows(cursor) -> list[dict[str, Any]]:
    return [{key: _decode(row[key]) for key in row.keys()} for row in cursor.fetchall()]


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
        if target.exists() and not (options or {}).get("upsert") in {True, "true"}:
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
        target = self._path(path)
        if not target.is_file():
            raise FileNotFoundError(path)
        # Browser-rendered files are served through the Next.js same-origin
        # proxy, which forwards the candidate's Bearer token to FastAPI.
        return {"signedURL": f"/api/files/{quote(self.bucket)}/{quote(path, safe='/')}"}


class LocalStorage:
    def __init__(self, settings: Settings):
        self.settings = settings

    def from_(self, bucket: str) -> LocalStorageObject:
        return LocalStorageObject(self.settings, bucket)


class Query:
    def __init__(self, client: "LocalClient", table: str):
        self.client = client
        self.table_name = _identifier(table)
        if self.table_name not in _TABLES:
            raise ValueError(f"Unknown table: {table}")
        self.operation = "select"
        self.columns = ["*"]
        self.filters: list[tuple[str, str, Any]] = []
        self.orders: list[tuple[str, bool]] = []
        self.max_rows: int | None = None
        self.single_row = False
        self.count_requested = False
        self.head = False
        self.payload: Any = None

    def select(self, columns: str = "*", count: str | None = None, head: bool = False):
        self.columns, self.count_requested, self.head = columns.split(","), count == "exact", head
        return self

    def eq(self, column: str, value: Any): return self._filter("=", column, value)
    def neq(self, column: str, value: Any): return self._filter("<>", column, value)
    def lt(self, column: str, value: Any): return self._filter("<", column, value)
    def lte(self, column: str, value: Any): return self._filter("<=", column, value)
    def gt(self, column: str, value: Any): return self._filter(">", column, value)
    def gte(self, column: str, value: Any): return self._filter(">=", column, value)
    def in_(self, column: str, values: list[Any]): return self._filter("IN", column, values)

    def is_(self, column: str, value: str):
        return self._filter("IS NULL" if value == "null" else "IS NOT NULL", column, None)

    def _filter(self, operator: str, column: str, value: Any):
        self.filters.append((operator, _identifier(column), value))
        return self

    def order(self, column: str, desc: bool = False):
        self.orders.append((_identifier(column), desc))
        return self

    def limit(self, amount: int): self.max_rows = max(0, int(amount)); return self
    def single(self): self.max_rows, self.single_row = 1, True; return self
    def insert(self, payload): self.operation, self.payload = "insert", payload; return self
    def update(self, payload): self.operation, self.payload = "update", payload; return self
    def upsert(self, payload): self.operation, self.payload = "upsert", payload; return self
    def delete(self): self.operation = "delete"; return self

    def execute(self) -> Result:
        with self.client.connection() as connection:
            cursor = connection.cursor()
            try:
                if self.operation == "select": result = self._select(cursor)
                elif self.operation == "insert": result = self._insert(cursor, False)
                elif self.operation == "upsert": result = self._insert(cursor, True)
                elif self.operation == "update": result = self._update(cursor)
                else: result = self._delete(cursor)
                if self.operation != "select":
                    connection.commit()
                return result
            finally:
                cursor.close()

    def _where(self):
        clauses, params = [], []
        for operator, column, value in self.filters:
            if operator in {"IS NULL", "IS NOT NULL"}:
                clauses.append(f"{column} {operator}")
            elif operator == "IN":
                values = list(value or [])
                if not values:
                    clauses.append("0")
                else:
                    clauses.append(f"{column} IN ({', '.join(['?'] * len(values))})")
                    params.extend(_value(item) for item in values)
            else:
                clauses.append(f"{column} {operator} ?")
                params.append(_value(value))
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", params

    def _select(self, cursor) -> Result:
        columns = [column.strip() for column in self.columns if column.strip()]
        plain = [column for column in columns if "(" not in column]
        projection = "*" if "*" in plain else ", ".join(_identifier(column) for column in plain) or "*"
        where, params = self._where()
        ordering = " ORDER BY " + ", ".join(f"{column} {'DESC' if desc else 'ASC'}" for column, desc in self.orders) if self.orders else ""
        limit = " LIMIT ?" if self.max_rows is not None else ""
        cursor.execute(f"SELECT {projection} FROM {self.table_name}{where}{ordering}{limit}", [*params, self.max_rows] if self.max_rows is not None else params)
        data = [] if self.head else _rows(cursor)
        total = None
        if self.count_requested:
            cursor.execute(f"SELECT count(*) AS count FROM {self.table_name}{where}", params)
            total = int(cursor.fetchone()[0])
        self.client.attach_nested(self.table_name, data, columns)
        if self.single_row:
            return Result(data[0] if data else None, total)
        return Result(data, total)

    def _write_rows(self):
        rows = self.payload if isinstance(self.payload, list) else [self.payload]
        prepared = []
        for row in rows:
            item = dict(row or {})
            if self.table_name in _ID_TABLES and not item.get("id"):
                item["id"] = str(uuid.uuid4())
            prepared.append(item)
        return prepared

    def _insert(self, cursor, upsert: bool) -> Result:
        rows = self._write_rows()
        if not rows: return Result()
        data = []
        for row in rows:
            keys = list(row)
            fields = ", ".join(_identifier(key) for key in keys)
            placeholders = ", ".join(["?"] * len(keys))
            conflict = ""
            if upsert:
                conflict_keys = {"user_id"} if self.table_name in {"candidate_preferences", "notification_preferences", "privacy_preferences"} else {"user_id", "job_id"} if self.table_name == "saved_jobs" else {"id"}
                existing = [key for key in keys if key in conflict_keys]
                if existing:
                    updates = ", ".join(f"{_identifier(key)} = excluded.{_identifier(key)}" for key in keys if key not in existing)
                    conflict = f" ON CONFLICT ({', '.join(existing)}) DO UPDATE SET {updates or existing[0]+' = excluded.'+existing[0]}"
            cursor.execute(f"INSERT INTO {self.table_name} ({fields}) VALUES ({placeholders}){conflict} RETURNING *", [_value(row[key]) for key in keys])
            data.append({key: _decode(value) for key, value in zip([description[0] for description in cursor.description], cursor.fetchone())})
        return Result(data)

    def _update(self, cursor) -> Result:
        values = self.payload or {}
        assignments = ", ".join(f"{_identifier(key)} = ?" for key in values)
        where, params = self._where()
        cursor.execute(f"UPDATE {self.table_name} SET {assignments}{where} RETURNING *", [_value(value) for value in values.values()] + params)
        return Result(_rows(cursor))

    def _delete(self, cursor) -> Result:
        where, params = self._where()
        cursor.execute(f"DELETE FROM {self.table_name}{where} RETURNING *", params)
        return Result(_rows(cursor))


class LocalClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.storage = LocalStorage(settings)
        self._thread_state = threading.local()
        Path(settings.database_path).resolve().parent.mkdir(parents=True, exist_ok=True)

    def connection(self):
        connection = getattr(self._thread_state, "connection", None)
        if connection is not None:
            return connection
        connection = sqlite3.connect(
            Path(self.settings.database_path).resolve(),
            timeout=SQLITE_CONNECT_TIMEOUT_SECONDS,
            check_same_thread=True,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {int(SQLITE_BUSY_TIMEOUT_MS)}")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        self._thread_state.connection = connection
        return connection

    def table(self, name: str) -> Query: return Query(self, name)

    def attach_nested(self, table: str, rows: list[dict[str, Any]], columns: list[str]) -> None:
        if table == "saved_jobs" and any("jobs(" in column for column in columns):
            ids = [row.get("job_id") for row in rows]
            if ids:
                placeholders = ",".join("?" for _ in ids)
                with self.connection() as connection:
                    related = connection.execute(f"SELECT * FROM jobs WHERE id IN ({placeholders})", ids).fetchall()
                jobs = {str(item["id"]): {key: _decode(item[key]) for key in item.keys()} for item in related}
                for row in rows: row["jobs"] = jobs.get(str(row.get("job_id")))
        if table == "learning_items" and any("learning_resources(" in column for column in columns):
            ids = [row.get("id") for row in rows]
            if ids:
                placeholders = ",".join("?" for _ in ids)
                with self.connection() as connection:
                    related = connection.execute(f"SELECT * FROM learning_resources WHERE learning_item_id IN ({placeholders})", ids).fetchall()
                resources = {}
                for item in related: resources.setdefault(str(item["learning_item_id"]), []).append({key: _decode(item[key]) for key in item.keys()})
                for row in rows: row["learning_resources"] = resources.get(str(row.get("id")), [])


def database_client(settings: Settings) -> LocalClient:
    return LocalClient(settings)


def database_probe(settings: Settings) -> dict[str, Any]:
    try:
        with database_client(settings).connection() as connection:
            connection.execute("SELECT 1")
        return {"status": "reachable", "configured": True, "database": str(Path(settings.database_path).resolve()), "engine": "sqlite"}
    except Exception as exc:
        return {"status": "unreachable", "configured": bool(settings.database_path), "engine": "sqlite", "error": str(exc)}
