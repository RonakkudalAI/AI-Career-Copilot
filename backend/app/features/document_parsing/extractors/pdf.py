from __future__ import annotations

import io
import logging
from typing import Any

from app.core.errors import ApiError
from app.features.document_parsing.source_blocks import SourceBlock

logger = logging.getLogger(__name__)


def parse_pdf_to_blocks(content: bytes) -> list[SourceBlock]:
    """Extract SourceBlocks using the first available backend that succeeds.

    Optional backends (PyMuPDF / pdfplumber) are tried when installed. On
    parse failure they fall through to the next backend. pypdf is the
    declared, always-available final backend. Encrypted-PDF errors do not fall
    through.
    """
    errors: list[str] = []
    empty_result = False

    for name, runner in (
        ("pymupdf", _try_fitz),
        ("pdfplumber", _try_pdfplumber),
        ("pypdf", _parse_pdf_pypdf),
    ):
        try:
            blocks = runner(content)
            if blocks:
                return blocks
            empty_result = True
            errors.append(f"{name}: no text blocks returned")
            logger.warning("pdf_backend_empty backend=%s", name)
        except ApiError as exc:
            if exc.code == "encrypted_pdf":
                raise
            errors.append(f"{name}: {exc.message}")
            logger.warning("pdf_backend_failed backend=%s code=%s", name, exc.code)
        except ImportError:
            continue
        except Exception as exc:
            errors.append(f"{name}: extractor failed")
            logger.warning("pdf_backend_failed backend=%s error=%s", name, exc)

    detail = "; ".join(errors) if errors else "no PDF backend available"
    if empty_result:
        return []
    raise ApiError(400, "pdf_parse_failed", f"Failed to parse PDF document: {detail[:500]}")


def _try_fitz(content: bytes) -> list[SourceBlock]:
    import fitz  # type: ignore[import-untyped]

    del fitz
    return _parse_pdf_fitz(content)


def _try_pdfplumber(content: bytes) -> list[SourceBlock]:
    import pdfplumber  # type: ignore[import-untyped]

    del pdfplumber
    return _parse_pdf_pdfplumber(content)


def _parse_pdf_fitz(content: bytes) -> list[SourceBlock]:
    import fitz  # type: ignore[import-untyped]

    blocks: list[SourceBlock] = []

    try:
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.is_encrypted:
            raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.")

        page_count = len(doc)
        if page_count == 0:
            return []

        for page_idx in range(1, page_count + 1):
            page = doc.load_page(page_idx - 1)
            text_page = page.get_text("blocks")
            sorted_blocks = sorted(text_page, key=lambda b: (round(b[1], 1), round(b[0], 1)))

            current_heading: str | None = None
            block_order = 1

            for b in sorted_blocks:
                if len(b) < 5 or not b[4]:
                    continue
                block_text = b[4].strip()
                if not block_text:
                    continue

                bbox = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
                lines = block_text.splitlines()
                first_line = lines[0].strip() if lines else block_text
                is_heading = (
                    len(block_text) <= 60
                    and not block_text.endswith(".")
                    and (block_text.isupper() or block_text.istitle())
                )

                if is_heading:
                    current_heading = first_line
                    b_type = "heading"
                else:
                    b_type = "paragraph"

                sb = SourceBlock.create(
                    page=page_idx,
                    order=block_order,
                    text=block_text,
                    block_type=b_type,
                    heading_context=current_heading,
                    bounding_box=bbox,
                )
                blocks.append(sb)
                block_order += 1

        doc.close()

    except ApiError:
        raise
    except Exception as exc:
        if "encrypted" in str(exc).lower() or "password" in str(exc).lower():
            raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.") from exc
        logger.error("fitz parsing failed: %s", exc)
        raise ApiError(400, "pdf_parse_failed", "Failed to parse PDF document with this extractor.") from exc

    return blocks


def _parse_pdf_pdfplumber(content: bytes) -> list[SourceBlock]:
    import pdfplumber  # type: ignore[import-untyped]

    blocks: list[SourceBlock] = []

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return []

            for page_idx, page in enumerate(pdf.pages, start=1):
                current_heading: str | None = None
                block_order = 1

                extracted_words = page.extract_words(
                    keep_blank_chars=False,
                    use_text_flow=True,
                )

                grouped_lines = _group_words_into_lines(extracted_words)

                for line_text, bbox, is_heading in grouped_lines:
                    if is_heading:
                        current_heading = line_text
                        b_type = "heading"
                    else:
                        b_type = "paragraph"

                    sb = SourceBlock.create(
                        page=page_idx,
                        order=block_order,
                        text=line_text,
                        block_type=b_type,
                        heading_context=current_heading,
                        bounding_box=bbox,
                    )
                    blocks.append(sb)
                    block_order += 1

    except ApiError:
        raise
    except Exception as exc:
        exc_str = (str(exc) + " " + repr(exc)).lower()
        if "encrypted" in exc_str or "password" in exc_str:
            raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.") from exc
        logger.error("pdfplumber parsing failed: %s", exc)
        raise ApiError(400, "pdf_parse_failed", "Failed to parse PDF document with this extractor.") from exc

    return blocks


def _group_words_into_lines(
    words: list[dict[str, Any]],
) -> list[tuple[str, tuple[float, float, float, float], bool]]:
    if not words:
        return []

    sorted_words = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))

    lines: list[list[dict[str, Any]]] = []
    current_line: list[dict[str, Any]] = []
    last_top: float | None = None

    for word in sorted_words:
        if last_top is None or abs(word["top"] - last_top) <= 3.0:
            current_line.append(word)
            last_top = word["top"]
        else:
            if current_line:
                lines.append(current_line)
            current_line = [word]
            last_top = word["top"]
    if current_line:
        lines.append(current_line)

    result: list[tuple[str, tuple[float, float, float, float], bool]] = []
    for line in lines:
        line_text = " ".join(w["text"] for w in line).strip()
        if not line_text:
            continue
        x0 = min(w["x0"] for w in line)
        top = min(w["top"] for w in line)
        x1 = max(w["x1"] for w in line)
        bottom = max(w["bottom"] for w in line)

        is_heading = (
            len(line_text) <= 60
            and not line_text.endswith(".")
            and (line_text.isupper() or line_text.istitle())
        )
        result.append((line_text, (x0, top, x1, bottom), is_heading))

    return result


def _parse_pdf_pypdf(content: bytes) -> list[SourceBlock]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.")

        blocks: list[SourceBlock] = []

        for page_idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

            current_heading: str | None = None
            for order, line in enumerate(lines, start=1):
                is_heading = len(line) <= 60 and not line.endswith(".") and (line.isupper() or line.istitle())
                if is_heading:
                    current_heading = line
                sb = SourceBlock.create(
                    page=page_idx,
                    order=order,
                    text=line,
                    block_type="heading" if is_heading else "paragraph",
                    heading_context=current_heading,
                    bounding_box=None,
                )
                blocks.append(sb)

        return blocks

    except ApiError:
        raise
    except Exception as exc:
        if "encrypted" in str(exc).lower() or "password" in str(exc).lower():
            raise ApiError(400, "encrypted_pdf", "Password-protected PDFs are not supported.") from exc
        raise ApiError(400, "pdf_parse_failed", "Failed to parse PDF document with this extractor.") from exc
