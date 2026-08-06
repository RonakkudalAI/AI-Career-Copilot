from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BlockType = Literal[
    "paragraph",
    "heading",
    "bullet_item",
    "table_cell",
    "table_row",
    "header",
    "footer",
    "code_block",
    "unclassified",
]
class SourceBlock(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    block_id: str = Field(
        ...,
        description="Deterministic block identifier, e.g., 'page-1-block-07'.",
        pattern=r"^page-\d+-block-\d+$",
    )
    page: int = Field(
        ...,
        ge=1,
        description="1-indexed page number where the block appears.",
    )
    order: int = Field(
        ...,
        ge=1,
        description="1-indexed sequence order of the block on the page or document.",
    )
    block_type: BlockType = Field(
        default="paragraph",
        description="Semantic type of the block.",
    )
    text: str = Field(
        ...,
        description="Exact raw text content extracted from the document fragment.",
    )
    heading_context: str | None = Field(
        default=None,
        description="Enclosing heading or section context active when block was parsed.",
    )
    bounding_box: tuple[float, float, float, float] | None = Field(
        default=None,
        description="[x0, y0, x1, y1] coordinates in PDF points (72 dpi). None for DOCX.",
    )
    @classmethod
    def create(
        cls,
        page: int,
        order: int,
        text: str,
        block_type: BlockType = "paragraph",
        heading_context: str | None = None,
        bounding_box: tuple[float, float, float, float] | Sequence[float] | None = None,
    ) -> SourceBlock:
        formatted_id = f"page-{page}-block-{order:02d}"
        bbox_tuple: tuple[float, float, float, float] | None = None
        if bounding_box is not None:
            if len(bounding_box) != 4:
                raise ValueError("bounding_box must contain exactly 4 coordinates (x0, y0, x1, y1)")
            bbox_tuple = (
                float(bounding_box[0]),
                float(bounding_box[1]),
                float(bounding_box[2]),
                float(bounding_box[3]),
            )
        return cls(
            block_id=formatted_id,
            page=page,
            order=order,
            block_type=block_type,
            text=text.strip(),
            heading_context=heading_context.strip() if heading_context else None,
            bounding_box=bbox_tuple,
        )
class SourceBlockCollection(BaseModel):
    blocks: list[SourceBlock] = Field(default_factory=list)
    def get_by_id(self, block_id: str) -> SourceBlock | None:
        for b in self.blocks:
            if b.block_id == block_id:
                return b
        return None
    def get_by_page(self, page: int) -> list[SourceBlock]:
        return [b for b in self.blocks if b.page == page]
    def total_character_count(self) -> int:
        return sum(len(b.text) for b in self.blocks)
    def text_density_per_page(self) -> dict[int, int]:
        density: dict[int, int] = {}
        for b in self.blocks:
            density[b.page] = density.get(b.page, 0) + len(b.text)
        return density
