"""
Document validation helpers + re-exports of source-true parsers.

Parsing lives in app.documents.parsing (text extraction + section boundaries).
This module keeps the document service boundary stable for routes and tests.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from pathlib import Path
from typing import Any

from app.core.errors import ApiError
from app.documents.parsing.sections import (
    HEADING_ALIASES,
    extract_sections,
    match_section_heading,
)
from app.documents.parsing.text_extract import DOCX_MIME, PDF_MIME, extract_text

ALLOWED_SUFFIXES = {".pdf": PDF_MIME, ".docx": DOCX_MIME}

# Re-export parsers through the document service boundary.
__all__ = [
    "PDF_MIME",
    "DOCX_MIME",
    "ALLOWED_SUFFIXES",
    "HEADING_ALIASES",
    "safe_filename",
    "sha256_bytes",
    "validate_document",
    "extract_text",
    "extract_sections",
    "match_section_heading",
    "infer_resume_title",
    "infer_job_metadata",
    "extract_skill_candidates",
]


def safe_filename(filename: str) -> str:
    name = Path(filename).name
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:180] or "document"


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def validate_document(filename: str, declared_mime: str | None, content: bytes, max_bytes: int) -> str:
    if not content:
        raise ApiError(400, "empty_document", "The selected document is empty.")
    if len(content) > max_bytes:
        raise ApiError(413, "document_too_large", "The selected document exceeds the 10 MB limit.")
    suffix = Path(filename).suffix.lower()
    expected = ALLOWED_SUFFIXES.get(suffix)
    if not expected:
        raise ApiError(415, "unsupported_document_type", "Only PDF and DOCX documents are supported.")
    if declared_mime and declared_mime not in {expected, "application/octet-stream"}:
        raise ApiError(415, "document_mime_mismatch", "The file extension and MIME type do not match.")
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise ApiError(415, "invalid_pdf_signature", "The selected file is not a valid PDF.")
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                if "word/document.xml" not in archive.namelist():
                    raise ApiError(
                        415, "invalid_docx_structure", "The selected file is not a valid DOCX document."
                    )
        except zipfile.BadZipFile as exc:
            raise ApiError(415, "invalid_docx_archive", "The selected DOCX file is corrupted.") from exc
    return expected


def infer_resume_title(filename: str | None) -> str:
    """Derive a resume library title from the uploaded filename."""
    stem = Path(filename or "Resume").stem
    cleaned = re.sub(r"[_\-]+", " ", stem).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or "Resume")[:200]


_ROLE_HINT = re.compile(
    r"\b(engineer|developer|analyst|manager|designer|scientist|architect|specialist|"
    r"lead|intern|consultant|administrator|officer|coordinator|executive|director)\b",
    re.I,
)


def infer_job_metadata(text: str) -> dict[str, str | None]:
    """
    Infer title, role, and company from job-description text so candidates
    do not need to type those fields manually. Uses only text present in the JD.
    """
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    role: str | None = None
    company: str | None = None
    confidence = "low"

    for line in lines[:60]:
        for label in (
            "job title",
            "position title",
            "role title",
            "designation",
            "opening for",
            "hiring for",
            "title",
            "position",
            "role",
        ):
            match = re.match(rf"^{re.escape(label)}\s*[:\-–]\s*(.+)$", line, re.I)
            if match and not role:
                role = match.group(1).strip()[:200]
                confidence = "high"
        for label in ("company", "organization", "organisation", "employer", "about the company"):
            match = re.match(rf"^{re.escape(label)}\s*[:\-–]\s*(.+)$", line, re.I)
            if match and not company:
                company = match.group(1).strip()[:200]

        looking = re.search(
            r"(?:we are (?:hiring|looking for|seeking)|hiring a[n]?|looking for a[n]?)\s+(.+)$",
            line,
            re.I,
        )
        if looking and not role:
            role = looking.group(1).strip(" .,:;-")[:200]
            confidence = "medium"

    if not role:
        for line in lines[:12]:
            if len(line) > 90 or re.search(r"https?://|www\.|@", line, re.I):
                continue
            if _ROLE_HINT.search(line):
                role = line[:200]
                confidence = "medium"
                break
    if not role and lines:
        first = lines[0]
        if len(first) <= 100 and not re.search(r"https?://|www\.|@", first, re.I):
            role = first[:200]
            confidence = "low"

    if role and company:
        title = f"{role} · {company}"[:200]
    elif role:
        title = role[:200]
    elif company:
        title = f"{company} role"[:200]
    else:
        title = "Job description"

    return {
        "title": title,
        "role_title": role,
        "company": company,
        "confidence": confidence,
    }


_SKILL_CANDIDATES = (
    "python",
    "java",
    "javascript",
    "typescript",
    "sql",
    "react",
    "node.js",
    "nodejs",
    "next.js",
    "nextjs",
    "django",
    "fastapi",
    "spring boot",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "git",
    "linux",
    "html",
    "css",
    "mongodb",
    "postgresql",
    "mysql",
    "redis",
    "graphql",
    "rest",
    "power bi",
    "tableau",
    "machine learning",
    "pandas",
    "numpy",
    "c++",
    "c#",
    "go",
    "rust",
    "kotlin",
    "swift",
    "figma",
    "jira",
)


def extract_skill_candidates(text: str, limit: int = 20) -> list[str]:
    """Extract known skill tokens from resume or JD text (deterministic)."""
    haystack = f" {(text or '').lower()} "
    labels = {
        "python": "Python",
        "java": "Java",
        "javascript": "JavaScript",
        "typescript": "TypeScript",
        "sql": "SQL",
        "react": "React",
        "node.js": "Node.js",
        "nodejs": "Node.js",
        "next.js": "Next.js",
        "nextjs": "Next.js",
        "django": "Django",
        "fastapi": "FastAPI",
        "spring boot": "Spring Boot",
        "aws": "AWS",
        "azure": "Azure",
        "gcp": "GCP",
        "docker": "Docker",
        "kubernetes": "Kubernetes",
        "git": "Git",
        "linux": "Linux",
        "html": "HTML",
        "css": "CSS",
        "mongodb": "MongoDB",
        "postgresql": "PostgreSQL",
        "mysql": "MySQL",
        "redis": "Redis",
        "graphql": "GraphQL",
        "rest": "REST",
        "power bi": "Power BI",
        "tableau": "Tableau",
        "machine learning": "Machine Learning",
        "pandas": "Pandas",
        "numpy": "NumPy",
        "c++": "C++",
        "c#": "C#",
        "go": "Go",
        "rust": "Rust",
        "kotlin": "Kotlin",
        "swift": "Swift",
        "figma": "Figma",
        "jira": "Jira",
    }
    found: list[str] = []
    seen: set[str] = set()
    for skill in _SKILL_CANDIDATES:
        token = skill.lower()
        pattern = rf"(?<![a-z0-9+#]){re.escape(token)}(?![a-z0-9+#])"
        if re.search(pattern, haystack):
            label = labels.get(token, skill.title())
            key = label.lower()
            if key not in seen:
                found.append(label)
                seen.add(key)
        if len(found) >= limit:
            break
    return found
