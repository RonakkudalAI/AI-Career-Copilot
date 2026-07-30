import hashlib
import io
import re
import zipfile
from pathlib import Path
from typing import Any

from docx import Document
from pypdf import PdfReader

from app.errors import ApiError

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ALLOWED_SUFFIXES = {".pdf": PDF_MIME, ".docx": DOCX_MIME}
HEADINGS = {
    "contact": {"contact", "contact details"},
    "summary": {"summary", "profile", "objective"},
    "skills": {"skills", "technical skills", "core skills"},
    "experience": {"experience", "work experience", "employment"},
    "projects": {"projects", "project experience"},
    "education": {"education", "academic background"},
    "certifications": {"certifications", "certificates"},
    "languages": {"languages"},
    "links": {"links"},
    "responsibilities": {"responsibilities"},
    "requirements": {"requirements", "required qualifications"},
    "preferred_qualifications": {"preferred qualifications", "preferred skills"},
}


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


def extract_text(content: bytes, mime_type: str) -> str:
    try:
        if mime_type == PDF_MIME:
            reader = PdfReader(io.BytesIO(content))
            if reader.is_encrypted:
                raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.")
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            document = Document(io.BytesIO(content))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(400, "document_parse_failed", "The document could not be read.") from exc
    if not text.strip():
        raise ApiError(
            422,
            "document_has_no_text",
            "No usable text was found. Scanned documents require OCR, which is not enabled.",
        )
    return text.strip()


def extract_sections(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    sections: dict[str, list[str]] = {}
    unclassified: list[str] = []
    current: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        normalized = re.sub(r"[^a-z ]", "", line.lower()).strip()
        matched = next((key for key, names in HEADINGS.items() if normalized in names), None)
        if matched:
            current = matched
            sections.setdefault(current, [])
        elif current:
            sections[current].append(line)
        else:
            unclassified.append(line)
    warnings = [] if sections else ["No recognised section headings were found; review all extracted text."]
    return {
        "schema_version": schema_version,
        "sections": sections,
        "unclassified_blocks": unclassified,
        "warnings": warnings,
        "corrections": {},
    }
