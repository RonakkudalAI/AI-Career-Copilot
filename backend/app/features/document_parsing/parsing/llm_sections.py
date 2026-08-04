"""
LLM-assisted document section segregation (source-line safe).

The model only assigns line numbers / kinds. Content always comes from the
source document — never from model-written text. NVIDIA is rate-limited;
Groq is fallback. Structural layout is the offline path.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.providers.groq_client import GroqClient
from app.agents.providers.nvidia_client import NvidiaClient
from app.core.config import Settings
from app.core.errors import ApiError

logger = logging.getLogger(__name__)

_PROMPT_PATH = (
    Path(__file__).resolve().parents[3] / "agents" / "prompts" / "document_section_extract_v1.txt"
)
_MAX_LINES = 400
_NVIDIA_MIN_INTERVAL_SECONDS = 1.6
_nvidia_lock = asyncio.Lock()
_last_nvidia_mono = 0.0

_BULLET_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\u2219•●○▪▸►\*◦‣⁃\-–—]\s+")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"https?://\S+|www\.\S+|(?:linkedin|github)\.com/\S+", re.I)
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{3,4}")
_WS_RE = re.compile(r"\s+")


class LlmSectionAssignment(BaseModel):
    """Line-index assignment only — content is reconstructed from source lines."""

    model_config = ConfigDict(extra="ignore")
    heading: str = Field(default="", max_length=200)
    kind: str = Field(min_length=1, max_length=80)
    line_numbers: list[int] = Field(default_factory=list, max_length=400)


class LlmDocumentSections(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sections: list[LlmSectionAssignment] = Field(default_factory=list, max_length=40)
    unclassified_line_numbers: list[int] = Field(default_factory=list, max_length=400)
    warnings: list[str] = Field(default_factory=list, max_length=40)


def _norm(text: str) -> str:
    return _WS_RE.sub(" ", (text or "").casefold()).strip()


def _slug_kind(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", (value or "").casefold()).strip("_")
    return (cleaned or "section")[:80]


def _looks_like_contact(line: str) -> bool:
    if _EMAIL_RE.search(line) or _URL_RE.search(line):
        return True
    digits = sum(ch.isdigit() for ch in line)
    return digits >= 8 and bool(_PHONE_RE.search(line))


def _title_case_word_ratio(line: str) -> float:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]*", line)
    if not words:
        return 0.0
    titled = sum(1 for word in words if word[:1].isupper())
    return titled / len(words)


def _looks_like_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 80:
        return False
    if _BULLET_RE.match(stripped):
        return False
    if _looks_like_contact(stripped):
        return False
    if stripped.endswith(".") and len(stripped.split()) > 3:
        return False
    if stripped.count(",") >= 2:
        return False
    words = stripped.split()
    if not words or len(words) > 8:
        return False
    if stripped.endswith(":") or stripped.isupper():
        return True
    if len(words) <= 6 and not re.search(r"\d{4}", stripped) and _title_case_word_ratio(stripped) >= 0.8:
        return True
    letters = [ch for ch in stripped if ch.isalpha()]
    if letters and sum(ch.isupper() for ch in letters) / len(letters) >= 0.55 and len(words) <= 6:
        return True
    return False


def _numbered_source_lines(text: str) -> list[str]:
    lines = [re.sub(r"\s+", " ", line).strip() for line in (text or "").splitlines()]
    return [line for line in lines if line][:_MAX_LINES]


def extract_sections_structural(text: str, schema_version: str = "resume-extraction-v1") -> dict[str, Any]:
    """Structural segregation using layout cues only (no LLM)."""
    raw: dict[str, list[str]] = {}
    unclassified: list[str] = []
    current: str | None = None
    seen_headings: list[str] = []
    pending_blank = False

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            pending_blank = True
            continue

        if _looks_like_heading(line) and (pending_blank or current is None or current == "contact"):
            label = line.rstrip(":").strip()
            kind = _slug_kind(label)
            current = kind
            raw.setdefault(current, [])
            if label not in seen_headings:
                seen_headings.append(label)
            pending_blank = False
            continue

        if current is None and _looks_like_contact(line):
            raw.setdefault("contact", []).append(line)
            pending_blank = False
            continue

        if current is None:
            unclassified.append(line)
            pending_blank = False
            continue

        if pending_blank and raw[current] and raw[current][-1] != "":
            raw[current].append("")
        pending_blank = False
        raw[current].append(line)

    sections: dict[str, list[str]] = {}
    for key, lines in raw.items():
        items = _group_items(key, [ln for ln in lines if ln is not None])
        if items:
            sections[key] = items

    warnings: list[str] = []
    if not sections:
        warnings.append("No section structure detected; review the full extracted text.")
    if unclassified and not sections:
        sections["body"] = unclassified
        unclassified = []
        warnings.append("Content stored under body because headings were not detected.")

    return {
        "schema_version": schema_version,
        "sections": sections,
        "unclassified_blocks": unclassified,
        "warnings": warnings,
        "corrections": {},
        "detected_headings": seen_headings,
        "extraction_method": "structural_layout_v1",
    }


def _group_items(kind: str, lines: list[str]) -> list[str]:
    kind_l = kind.casefold()
    multi_entry = any(
        token in kind_l
        for token in ("experience", "project", "education", "certif", "achievement", "employ", "work", "internship")
    )
    skillish = any(token in kind_l for token in ("skill", "technolog", "competenc", "tool", "stack"))

    if skillish:
        return _split_skillish(lines)
    if not multi_entry:
        return [line for line in lines if line.strip()]

    entries: list[str] = []
    current: list[str] = []

    def flush() -> None:
        nonlocal current
        if current:
            entries.append("\n".join(current).strip())
            current = []

    for line in lines:
        if not line.strip():
            flush()
            continue
        stripped = line.strip()
        if current and not _BULLET_RE.match(stripped) and _looks_like_entry_header(stripped):
            flush()
        current.append(stripped)
    flush()
    return entries


def _looks_like_entry_header(line: str) -> bool:
    if _BULLET_RE.match(line):
        return False
    if re.search(
        r"(?:19|20)\d{2}\s*[-–—to]+\s*(?:(?:19|20)\d{2}|present|current|now|ongoing)",
        line,
        re.I,
    ):
        return True
    if "|" in line and len(line) <= 140 and not line.endswith("."):
        return True
    if re.search(r"\s[-–—]\s", line) and len(line.split()) <= 14 and not line.endswith("."):
        return True
    return False


def _split_skillish(lines: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        payload = stripped
        if ":" in stripped:
            left, right = stripped.split(":", 1)
            if len(left.strip()) <= 48 and not re.search(r"\d{4}", left):
                payload = right
        parts = [p.strip() for p in re.split(r"[,;|/]|·|•", payload) if p.strip()]
        candidates = parts if len(parts) >= 2 else [stripped]
        for part in candidates:
            key = part.casefold()
            if len(part) < 2 or key in seen:
                continue
            seen.add(key)
            result.append(part)
    return result


def _materialize_from_line_numbers(
    result: LlmDocumentSections,
    source_lines: list[str],
    schema_version: str,
) -> dict[str, Any]:
    """Rebuild section content solely from source line indexes (1-based)."""
    max_n = len(source_lines)
    used: set[int] = set()
    sections: dict[str, list[str]] = {}
    detected: list[str] = []
    invalid = 0

    for block in result.sections:
        kind = _slug_kind(block.kind or block.heading)
        heading = (block.heading or "").strip()
        if heading and heading not in detected:
            # Only keep heading if it appears in source (exact or normalize match).
            if any(_norm(heading) == _norm(line) for line in source_lines) or any(
                _norm(heading) in _norm(line) for line in source_lines[:20]
            ):
                detected.append(heading)
        collected: list[str] = []
        for num in block.line_numbers or []:
            if not isinstance(num, int) or num < 1 or num > max_n:
                invalid += 1
                continue
            if num in used:
                continue
            used.add(num)
            collected.append(source_lines[num - 1])
        if collected:
            sections.setdefault(kind, []).extend(_group_items(kind, collected))

    unclassified: list[str] = []
    for num in result.unclassified_line_numbers or []:
        if not isinstance(num, int) or num < 1 or num > max_n or num in used:
            continue
        used.add(num)
        unclassified.append(source_lines[num - 1])

    # Any source lines the model skipped stay available for review.
    leftovers = [source_lines[i] for i in range(max_n) if (i + 1) not in used]
    if leftovers:
        unclassified.extend(leftovers)

    warnings = [str(w).strip()[:300] for w in (result.warnings or []) if str(w).strip()]
    if invalid:
        warnings.append(f"Ignored {invalid} invalid line number(s) outside the source range.")
    if not sections:
        warnings.append("LLM returned no valid line assignments.")

    return {
        "schema_version": schema_version,
        "sections": sections,
        "unclassified_blocks": unclassified,
        "warnings": warnings,
        "corrections": {},
        "detected_headings": detected,
        "extraction_method": "llm_line_assignment_v1",
    }


async def _throttle_nvidia() -> None:
    global _last_nvidia_mono
    async with _nvidia_lock:
        now = time.monotonic()
        wait = _NVIDIA_MIN_INTERVAL_SECONDS - (now - _last_nvidia_mono)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_nvidia_mono = time.monotonic()


async def _llm_segregate(settings: Settings, source_lines: list[str]) -> LlmDocumentSections:
    prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    numbered = "\n".join(f"{index}|{line}" for index, line in enumerate(source_lines, start=1))
    payload = {
        "numbered_lines": numbered,
        "line_count": len(source_lines),
        "goal": "assign_line_numbers_to_sections",
    }

    if settings.nvidia_configured:
        try:
            await _throttle_nvidia()
            return await NvidiaClient(settings).generate_structured(
                system_prompt=prompt,
                user_payload=payload,
                schema_model=LlmDocumentSections,
                temperature=0.0,
                allow_repair=False,
            )
        except ApiError as exc:
            if exc.status_code != 429 or not getattr(settings, "groq_resume_parser_configured", False):
                if exc.status_code != 429 or not settings.groq_configured:
                    raise
            logger.warning("document_section_nvidia_rate_limited falling_back=groq")
        except Exception as exc:
            if not (getattr(settings, "groq_resume_parser_configured", False) or settings.groq_configured):
                raise
            logger.warning("document_section_nvidia_failed error=%s falling_back=groq", type(exc).__name__)

    if getattr(settings, "groq_resume_parser_configured", False):
        client = GroqClient(settings)
        try:
            return await client.generate_structured(
                system_prompt=prompt,
                user_payload=payload,
                schema_model=LlmDocumentSections,
                temperature=getattr(settings, "groq_resume_parser_temperature", 0.0),
                allow_repair=False,
                model=getattr(settings, "groq_resume_parser_model", None),
                timeout_seconds=getattr(settings, "groq_resume_parser_timeout_seconds", None),
                max_retries=getattr(settings, "groq_resume_parser_max_retries", None),
                strict_schema=True,
            )
        except ApiError:
            fallback = getattr(settings, "groq_resume_parser_fallback_model", None)
            if not fallback:
                raise
            logger.warning("document_section_groq_primary_failed falling_back=parser_fallback_model")
            return await client.generate_structured(
                system_prompt=prompt,
                user_payload=payload,
                schema_model=LlmDocumentSections,
                temperature=getattr(settings, "groq_resume_parser_temperature", 0.0),
                allow_repair=False,
                model=fallback,
                timeout_seconds=getattr(settings, "groq_resume_parser_timeout_seconds", None),
                max_retries=getattr(settings, "groq_resume_parser_max_retries", None),
                strict_schema=True,
            )

    if settings.groq_configured:
        return await GroqClient(settings).generate_structured(
            system_prompt=prompt,
            user_payload=payload,
            schema_model=LlmDocumentSections,
            temperature=0.0,
            allow_repair=False,
        )

    raise ApiError(503, "llm_not_configured", "No LLM is configured for document section extraction.")


async def extract_sections_enriched(
    text: str,
    settings: Settings | None = None,
    schema_version: str = "resume-extraction-v1",
    *,
    prefer_llm: bool = True,
) -> dict[str, Any]:
    """Segregate document text into sections without inventing content."""
    source = (text or "").strip()
    if not source:
        return {
            "schema_version": schema_version,
            "sections": {},
            "unclassified_blocks": [],
            "warnings": ["Document text is empty."],
            "corrections": {},
            "detected_headings": [],
            "extraction_method": "empty",
        }

    structural = extract_sections_structural(source, schema_version)
    source_lines = _numbered_source_lines(source)
    if not prefer_llm or settings is None or not source_lines:
        return structural

    llm_ready = settings.nvidia_configured or settings.groq_configured or getattr(
        settings, "groq_resume_parser_configured", False
    )
    if not llm_ready:
        return structural

    try:
        llm = await _llm_segregate(settings, source_lines)
        materialised = _materialize_from_line_numbers(llm, source_lines, schema_version)
        if materialised.get("sections"):
            return materialised
        logger.warning("document_section_llm_empty using_structural_fallback")
        structural["warnings"] = list(structural.get("warnings") or []) + [
            "LLM line assignment produced no sections; used structural layout."
        ]
        return structural
    except Exception as exc:
        logger.warning("document_section_llm_failed error=%s using_structural_fallback", type(exc).__name__)
        structural["warnings"] = list(structural.get("warnings") or []) + [
            "LLM segregation unavailable; used structural layout."
        ]
        return structural
