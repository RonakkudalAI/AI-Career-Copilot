import re
from dataclasses import asdict, dataclass
from typing import Any

from app.documents.service import sha256_bytes


@dataclass(frozen=True)
class ResumeBlock:
    block_id: str
    section_key: str
    text: str
    source_hash: str


@dataclass(frozen=True)
class ResumeFact:
    fact_type: str
    normalized_value: str
    display_value: str
    source_block_id: str


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def source_hash(value: str) -> str:
    return sha256_bytes(normalize_text(value).encode("utf-8"))


def _section_lines(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return []


def build_blocks(structured_content: dict[str, Any]) -> list[ResumeBlock]:
    sections = structured_content.get("sections")
    if not isinstance(sections, dict):
        return []
    blocks: list[ResumeBlock] = []
    for section_key, value in sections.items():
        safe_section = re.sub(r"[^a-z0-9_-]", "-", str(section_key).lower()).strip("-")
        for index, text in enumerate(_section_lines(value), start=1):
            normalized = normalize_text(text)
            blocks.append(
                ResumeBlock(
                    block_id=f"{safe_section}-{index}",
                    section_key=safe_section,
                    text=normalized,
                    source_hash=source_hash(normalized),
                )
            )
    return blocks


def _fact_values(block: ResumeBlock) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    if block.section_key == "skills":
        for value in re.split(r"[,|;/]", block.text):
            if value.strip():
                values.append(("skill", value.strip()))
    if block.section_key in {"experience", "projects", "education", "certifications", "languages"}:
        for value in re.findall(r"\b(?:[A-Z][\w.+#-]*)(?:\s+[A-Z][\w.+#-]*){0,4}\b", block.text):
            values.append(("entity", value))
    for value in re.findall(r"(?<!\w)(?:\d+(?:\.\d+)?%?|(?:19|20)\d{2})(?!\w)", block.text):
        values.append(("number_or_date", value))
    for value in re.findall(r"https?://\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", block.text):
        values.append(("contact_or_url", value.rstrip(".,;")))
    return values


def build_fact_inventory(blocks: list[ResumeBlock]) -> list[ResumeFact]:
    seen: set[tuple[str, str, str]] = set()
    facts: list[ResumeFact] = []
    for block in blocks:
        for fact_type, value in _fact_values(block):
            normalized = normalize_text(value).casefold()
            key = (fact_type, normalized, block.block_id)
            if normalized and key not in seen:
                seen.add(key)
                facts.append(ResumeFact(fact_type, normalized, value, block.block_id))
    return facts


def evidence_bundle(
    structured_content: dict[str, Any], requested_sections: list[str]
) -> tuple[list[ResumeBlock], list[ResumeFact], dict[str, Any]]:
    blocks = build_blocks(structured_content)
    selected = [block for block in blocks if block.section_key in requested_sections]
    facts = build_fact_inventory(blocks)
    payload = {
        "selected_blocks": [asdict(block) for block in selected],
        "verified_facts": [asdict(fact) for fact in facts],
    }
    return blocks, facts, payload
