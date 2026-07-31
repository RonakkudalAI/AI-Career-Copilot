import re
from dataclasses import dataclass

from app.resumes.evidence import ResumeBlock, normalize_text, source_hash
from app.api.schemas import ProviderSuggestion

NUMBER_PATTERN = re.compile(r"(?<!\w)(?:\d+(?:\.\d+)?%?|(?:19|20)\d{2})(?!\w)")
CONTACT_PATTERN = re.compile(r"https?://\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{7,}\d")
PROPER_TOKEN_PATTERN = re.compile(r"\b(?:[A-Z][a-z]+[A-Z]\w*|[A-Z]{2,}|[A-Z][\w.+#-]+)\b")
COMMON_CAPITALIZED = {
    "Built",
    "Created",
    "Developed",
    "Delivered",
    "Designed",
    "Implemented",
    "Improved",
    "Led",
    "Maintained",
    "Managed",
    "Optimized",
    "Reduced",
    "Supported",
    "Used",
    "Worked",
}


@dataclass(frozen=True)
class ValidationResult:
    status: str
    issues: list[str]
    source_hash: str


def _tokens(value: str) -> set[str]:
    return {token.casefold() for token in re.findall(r"[A-Za-z][A-Za-z0-9.+#-]*", value)}


def validate_suggestion(
    suggestion: ProviderSuggestion,
    blocks: dict[str, ResumeBlock],
    requested_sections: set[str],
) -> ValidationResult:
    issues: list[str] = []
    block = blocks.get(suggestion.source_block_id)
    if block is None:
        return ValidationResult("blocked", ["unknown_source_block"], "")
    current_hash = source_hash(block.text)
    if normalize_text(suggestion.source_text) != normalize_text(block.text):
        issues.append("source_text_mismatch")
    if block.section_key != suggestion.section_key or suggestion.section_key not in requested_sections:
        issues.append("unsupported_section")
    if suggestion.section_key in {"contact", "links"} or CONTACT_PATTERN.search(suggestion.proposed_text):
        issues.append("contact_change_blocked")

    cited = [blocks[reference] for reference in suggestion.evidence_references if reference in blocks]
    if len(cited) != len(set(suggestion.evidence_references)) or not cited:
        issues.append("unsupported_evidence_reference")
    evidence_text = " ".join(item.text for item in cited)
    evidence_numbers = set(NUMBER_PATTERN.findall(evidence_text))
    unsupported_numbers = set(NUMBER_PATTERN.findall(suggestion.proposed_text)) - evidence_numbers
    if unsupported_numbers:
        issues.append("unsupported_number_or_date")

    evidence_entities = set(PROPER_TOKEN_PATTERN.findall(evidence_text))
    proposed_entities = set(PROPER_TOKEN_PATTERN.findall(suggestion.proposed_text)) - COMMON_CAPITALIZED
    first_word = re.match(r"\s*([A-Z][\w.+#-]*)", suggestion.proposed_text)
    if first_word:
        proposed_entities.discard(first_word.group(1))
    if proposed_entities - evidence_entities:
        issues.append("unsupported_entity_or_skill")

    source_tokens = _tokens(block.text)
    proposed_tokens = _tokens(suggestion.proposed_text)
    overlap = len(source_tokens & proposed_tokens) / max(1, len(source_tokens))
    if overlap < 0.2:
        issues.append("meaning_change_risk")
    if len(suggestion.proposed_text) > max(400, len(block.text) * 3):
        issues.append("excessive_rewrite")

    blocking = {
        "source_text_mismatch",
        "unsupported_section",
        "contact_change_blocked",
        "unsupported_evidence_reference",
        "unsupported_number_or_date",
        "unsupported_entity_or_skill",
        "meaning_change_risk",
        "excessive_rewrite",
    }
    status = "blocked" if any(issue in blocking for issue in issues) else ("warning" if issues else "passed")
    return ValidationResult(status, issues, current_hash)


def is_source_stale(expected_hash: str, current_text: str) -> bool:
    return expected_hash != source_hash(current_text)
