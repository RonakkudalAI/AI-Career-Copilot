from __future__ import annotations

import io
import logging
from docx import Document
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.core.errors import ApiError
from app.features.document_parsing.source_blocks import SourceBlock

logger = logging.getLogger(__name__)


def parse_docx_to_blocks(content: bytes) -> list[SourceBlock]:
    """
    Extract SourceBlock objects from DOCX bytes preserving body reading order.
    """
    try:
        doc = Document(io.BytesIO(content))
    except Exception as exc:
        raise ApiError(415, "invalid_docx_archive", f"Corrupted or invalid DOCX file: {exc}") from exc

    blocks: list[SourceBlock] = []
    order = 1
    current_heading: str | None = None
    page = 1  # DOCX logically flows on 1 page unless page breaks encountered

    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            p = Paragraph(child, doc)
            text = (p.text or "").strip()
            if not text:
                continue

            # Heading detection from style or formatting
            style_name = (p.style.name or "").lower() if p.style else ""
            is_heading = "heading" in style_name or _is_formatted_heading(p, text)

            if is_heading:
                current_heading = text
                b_type = "heading"
            elif _is_bullet_paragraph(p, text):
                b_type = "bullet_item"
            else:
                b_type = "paragraph"

            sb = SourceBlock.create(
                page=page,
                order=order,
                text=text,
                block_type=b_type,
                heading_context=current_heading,
                bounding_box=None,
            )
            blocks.append(sb)
            order += 1

        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            for row_idx, row in enumerate(table.rows, start=1):
                row_cells = [(cell.text or "").strip() for cell in row.cells]
                # Deduplicate adjacent identical cells resulting from cell merging
                unique_cells: list[str] = []
                for cell_text in row_cells:
                    if cell_text and (not unique_cells or cell_text != unique_cells[-1]):
                        unique_cells.append(cell_text)

                if not unique_cells:
                    continue

                row_str = " | ".join(unique_cells)
                sb = SourceBlock.create(
                    page=page,
                    order=order,
                    text=f"[Table Row] {row_str}",
                    block_type="table_row",
                    heading_context=current_heading,
                    bounding_box=None,
                )
                blocks.append(sb)
                order += 1

    return blocks


def _is_formatted_heading(p: Paragraph, text: str) -> bool:
    if len(text) > 80:
        return False
    if text.endswith(":"):
        return True
    # Check if all runs are bold and short line
    if p.runs and all(r.bold for r in p.runs if r.text.strip()):
        return True
    return False


def _is_bullet_paragraph(p: Paragraph, text: str) -> bool:
    style_name = (p.style.name or "").lower() if p.style else ""
    if "bullet" in style_name or "list" in style_name:
        return True
    return text.startswith(("•", "-", "–", "*", "◦", "▪"))
