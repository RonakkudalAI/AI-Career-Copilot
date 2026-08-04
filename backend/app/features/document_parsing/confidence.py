from __future__ import annotations

from typing import Any


def calculate_confidence(
    *,
    total_values: int,
    grounded_values: int,
    warnings: int,
    contamination_issues: int,
    is_scanned: bool,
) -> dict[str, Any]:
    """Calculate a transparent confidence signal from deterministic parse evidence."""
    if total_values == 0:
        score = 0.0
    else:
        score = grounded_values / total_values
    if is_scanned:
        score *= 0.85
    score = max(0.0, score - min(0.25, contamination_issues * 0.05) - min(0.2, warnings * 0.01))
    level = "HIGH" if score >= 0.9 else "MEDIUM" if score >= 0.7 else "LOW" if score >= 0.45 else "NEEDS_REVIEW"
    return {
        "level": level,
        "score": round(score, 4),
        "total_values": total_values,
        "grounded_values": grounded_values,
        "warning_count": warnings,
        "contamination_count": contamination_issues,
        "ocr_adjusted": is_scanned,
    }
