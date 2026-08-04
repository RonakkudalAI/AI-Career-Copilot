from __future__ import annotations

import io
import logging
import shutil
from typing import Literal

from pydantic import BaseModel, Field

from app.features.document_parsing.source_blocks import SourceBlock

logger = logging.getLogger(__name__)

ExtractionStatus = Literal["SUCCESS", "OCR_REQUIRED_UNSUPPORTED", "FAILED"]


class ExtractionResult(BaseModel):
    status: ExtractionStatus
    blocks: list[SourceBlock] = Field(default_factory=list)
    is_scanned: bool = False
    message: str = ""


def is_ocr_available() -> tuple[bool, str]:
    """
    Check if OCR dependencies and system binary tools are installed.

    Returns:
        (available: bool, reason: str)
    """
    try:
        import pytesseract  # type: ignore
        import pdf2image  # type: ignore
    except ImportError as e:
        return False, f"Missing Python OCR libraries: {e.name if hasattr(e, 'name') else e}"

    tesseract_cmd = shutil.which("tesseract")
    if not tesseract_cmd:
        return False, "Tesseract OCR binary 'tesseract' not found in system PATH."

    return True, "OCR system is fully functional."


def process_scanned_pdf(content: bytes) -> ExtractionResult:
    """
    Process scanned PDF using OCR if available; return explicit OCR_REQUIRED_UNSUPPORTED state if not.
    """
    ocr_ok, reason = is_ocr_available()
    if not ocr_ok:
        logger.warning("Scanned PDF detected but OCR is unavailable: %s", reason)
        return ExtractionResult(
            status="OCR_REQUIRED_UNSUPPORTED",
            blocks=[],
            is_scanned=True,
            message=(
                "Scanned or image-only document detected. "
                "Optical Character Recognition (OCR) is not installed on the server."
            ),
        )

    # Perform OCR using pdf2image and pytesseract when dependencies are present
    try:
        import pdf2image  # type: ignore
        import pytesseract  # type: ignore

        images = pdf2image.convert_from_bytes(content)
        blocks: list[SourceBlock] = []

        for page_idx, img in enumerate(images, start=1):
            ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            n_boxes = len(ocr_data["text"])

            page_text_lines: list[tuple[str, tuple[float, float, float, float]]] = []
            current_line_words: list[str] = []
            current_bbox: list[float] | None = None
            last_line_num = -1

            for i in range(n_boxes):
                text_word = str(ocr_data["text"][i]).strip()
                if not text_word:
                    continue

                line_num = ocr_data["line_num"][i]
                x, y, w, h = (
                    ocr_data["left"][i],
                    ocr_data["top"][i],
                    ocr_data["width"][i],
                    ocr_data["height"][i],
                )

                if line_num != last_line_num and current_line_words:
                    line_str = " ".join(current_line_words)
                    page_text_lines.append((line_str, (current_bbox[0], current_bbox[1], current_bbox[2], current_bbox[3])))
                    current_line_words = []
                    current_bbox = None

                current_line_words.append(text_word)
                if current_bbox is None:
                    current_bbox = [float(x), float(y), float(x + w), float(y + h)]
                else:
                    current_bbox[0] = min(current_bbox[0], float(x))
                    current_bbox[1] = min(current_bbox[1], float(y))
                    current_bbox[2] = max(current_bbox[2], float(x + w))
                    current_bbox[3] = max(current_bbox[3], float(y + h))
                last_line_num = line_num

            if current_line_words and current_bbox:
                line_str = " ".join(current_line_words)
                page_text_lines.append((line_str, (current_bbox[0], current_bbox[1], current_bbox[2], current_bbox[3])))

            current_heading: str | None = None
            for order, (line_str, bbox) in enumerate(page_text_lines, start=1):
                is_heading = len(line_str) <= 60 and (line_str.isupper() or line_str.istitle())
                if is_heading:
                    current_heading = line_str

                sb = SourceBlock.create(
                    page=page_idx,
                    order=order,
                    text=line_str,
                    block_type="heading" if is_heading else "paragraph",
                    heading_context=current_heading,
                    bounding_box=bbox,
                )
                blocks.append(sb)

        return ExtractionResult(
            status="SUCCESS",
            blocks=blocks,
            is_scanned=True,
            message="OCR text extraction completed successfully.",
        )

    except Exception as exc:
        logger.error("OCR execution error: %s", exc)
        return ExtractionResult(
            status="FAILED",
            blocks=[],
            is_scanned=True,
            message=f"OCR execution failed: {exc}",
        )
