"""
Evaluation Metrics Calculator for Resume Parsing E2E Testing Track.

Calculates 14 required evaluation metrics against parsed outputs and golden benchmark outputs:
1. Field precision
2. Field recall
3. Section placement accuracy
4. Experience entry accuracy
5. Project entry accuracy
6. Skill contamination rate
7. Unsupported field count
8. Evidence coverage
9. Duplicate rate
10. Omission rate
11. Determinism
12. Provider failure rate
13. Average parsing time
14. Grounding enforcement rate
"""

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class EvaluationResults:
    field_precision: float
    field_recall: float
    section_placement_accuracy: float
    experience_entry_accuracy: float
    project_entry_accuracy: float
    skill_contamination_rate: float
    unsupported_field_count: int
    evidence_coverage: float
    duplicate_rate: float
    omission_rate: float
    determinism: float
    provider_failure_rate: float
    average_parsing_time: float
    grounding_enforcement_rate: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_precision": round(self.field_precision, 4),
            "field_recall": round(self.field_recall, 4),
            "section_placement_accuracy": round(self.section_placement_accuracy, 4),
            "experience_entry_accuracy": round(self.experience_entry_accuracy, 4),
            "project_entry_accuracy": round(self.project_entry_accuracy, 4),
            "skill_contamination_rate": round(self.skill_contamination_rate, 4),
            "unsupported_field_count": self.unsupported_field_count,
            "evidence_coverage": round(self.evidence_coverage, 4),
            "duplicate_rate": round(self.duplicate_rate, 4),
            "omission_rate": round(self.omission_rate, 4),
            "determinism": round(self.determinism, 4),
            "provider_failure_rate": round(self.provider_failure_rate, 4),
            "average_parsing_time": round(self.average_parsing_time, 4),
            "grounding_enforcement_rate": round(self.grounding_enforcement_rate, 4),
        }


CONTENT_SECTION_KEYS = [
    "contact",
    "professional_summary",
    "target_role",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "licences",
    "achievements",
    "publications",
    "languages",
    "volunteer_experience",
    "training",
    "links",
    "additional_sections",
]


def _extract_field_value(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        val = obj.get("value")
    elif hasattr(obj, "value"):
        val = getattr(obj, "value")
    else:
        val = obj
    if isinstance(val, str) and not val.strip():
        return None
    return val


def _extract_field_evidence(obj: Any) -> List[str]:
    if obj is None:
        return []
    if isinstance(obj, dict):
        return obj.get("evidence_block_ids") or []
    elif hasattr(obj, "evidence_block_ids"):
        return getattr(obj, "evidence_block_ids") or []
    return []


def _is_field_wrapper(obj: Any) -> bool:
    if isinstance(obj, dict) and "value" in obj:
        return True
    if hasattr(obj, "value") and hasattr(obj, "evidence_block_ids"):
        return True
    return False


def _iter_field_wrappers(obj: Any, path: str = "") -> List[Tuple[str, Any]]:
    wrappers = []
    if _is_field_wrapper(obj):
        wrappers.append((path, obj))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            child_path = f"{path}.{k}" if path else k
            wrappers.extend(_iter_field_wrappers(v, child_path))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            child_path = f"{path}[{idx}]"
            wrappers.extend(_iter_field_wrappers(item, child_path))
    return wrappers


def _compare_values(p_val: Any, g_val: Any) -> bool:
    if p_val is None or g_val is None:
        return False
    if isinstance(p_val, bool) or isinstance(g_val, bool):
        return bool(p_val) == bool(g_val)

    p_str = str(p_val).strip().casefold()
    g_str = str(g_val).strip().casefold()
    if not p_str or not g_str:
        return False

    return p_str == g_str or p_str in g_str or g_str in p_str


def _get_item_key(item: Any, key_fields: List[str]) -> str:
    parts = []
    for k in key_fields:
        val = None
        if isinstance(item, dict):
            val = _extract_field_value(item.get(k))
            if val is None and k == "name":
                val = _extract_field_value(item.get("project_name"))
            elif val is None and k == "project_name":
                val = _extract_field_value(item.get("name"))
        elif hasattr(item, k):
            val = _extract_field_value(getattr(item, k))
        if val is not None:
            parts.append(str(val).strip().casefold())
    return "|".join(parts) if parts else ""


def _match_list_items(
    p_list: List[Any], g_list: List[Any], key_fields: List[str]
) -> Tuple[List[Tuple[Any, Any]], List[Any], List[Any]]:
    matched_pairs = []
    unmatched_p = list(p_list)
    unmatched_g = list(g_list)

    g_used = set()
    for p_item in p_list:
        p_key = _get_item_key(p_item, key_fields)
        if not p_key:
            continue
        best_g_idx = None
        for g_idx, g_item in enumerate(unmatched_g):
            if g_idx in g_used:
                continue
            g_key = _get_item_key(g_item, key_fields)
            if g_key and (p_key == g_key or p_key in g_key or g_key in p_key):
                best_g_idx = g_idx
                break
        if best_g_idx is not None:
            matched_pairs.append((p_item, unmatched_g[best_g_idx]))
            g_used.add(best_g_idx)
            unmatched_p.remove(p_item)

    unmatched_g_remaining = [g for i, g in enumerate(unmatched_g) if i not in g_used]
    return matched_pairs, unmatched_p, unmatched_g_remaining


def calculate_field_precision_and_recall(parsed: Dict[str, Any], golden: Dict[str, Any]) -> Tuple[float, float]:
    tp = 0
    fp = 0
    fn = 0

    def evaluate_scalar_field(p_val: Any, g_val: Any) -> None:
        nonlocal tp, fp, fn
        if p_val is not None and g_val is not None:
            if _compare_values(p_val, g_val):
                tp += 1
            else:
                fp += 1
                fn += 1
        elif p_val is not None and g_val is None:
            fp += 1
        elif p_val is None and g_val is not None:
            fn += 1

    def evaluate_string_list(p_list: List[Any], g_list: List[Any]) -> None:
        nonlocal tp, fp, fn
        p_vals = [_extract_field_value(x) for x in p_list if _extract_field_value(x) is not None]
        g_vals = [_extract_field_value(x) for x in g_list if _extract_field_value(x) is not None]

        g_matched = set()
        for p_v in p_vals:
            found = False
            for idx, g_v in enumerate(g_vals):
                if idx not in g_matched and _compare_values(p_v, g_v):
                    g_matched.add(idx)
                    tp += 1
                    found = True
                    break
            if not found:
                fp += 1
        fn += len(g_vals) - len(g_matched)

    # 1. Contact Section
    p_contact = parsed.get("contact", {}) or {}
    g_contact = golden.get("contact", {}) or {}
    contact_scalars = ["full_name", "email", "phone", "location", "linkedin", "github", "portfolio"]
    for field_name in contact_scalars:
        evaluate_scalar_field(
            _extract_field_value(p_contact.get(field_name)),
            _extract_field_value(g_contact.get(field_name))
        )
    evaluate_string_list(p_contact.get("other_links", []), g_contact.get("other_links", []))

    # 2. Professional Summary & 3. Target Role
    evaluate_scalar_field(_extract_field_value(parsed.get("professional_summary")), _extract_field_value(golden.get("professional_summary")))
    evaluate_scalar_field(_extract_field_value(parsed.get("target_role")), _extract_field_value(golden.get("target_role")))

    # Helper for evaluating list of structured items
    def evaluate_section_list(
        p_sec_key: str,
        g_sec_key: str,
        key_fields: List[str],
        scalar_fields: List[str],
        list_fields: List[str] = None
    ) -> None:
        nonlocal tp, fp, fn
        list_fields = list_fields or []
        p_items = parsed.get(p_sec_key, []) or []
        g_items = golden.get(g_sec_key, []) or []

        matched_pairs, unmatched_p, unmatched_g = _match_list_items(p_items, g_items, key_fields)

        for p_item, g_item in matched_pairs:
            for s_field in scalar_fields:
                p_val = _extract_field_value(p_item.get(s_field) if isinstance(p_item, dict) else getattr(p_item, s_field, None))
                g_val = _extract_field_value(g_item.get(s_field) if isinstance(g_item, dict) else getattr(g_item, s_field, None))
                evaluate_scalar_field(p_val, g_val)
            for l_field in list_fields:
                p_l = p_item.get(l_field, []) if isinstance(p_item, dict) else getattr(p_item, l_field, [])
                g_l = g_item.get(l_field, []) if isinstance(g_item, dict) else getattr(g_item, l_field, [])
                evaluate_string_list(p_l or [], g_l or [])

        for p_item in unmatched_p:
            wrappers = _iter_field_wrappers(p_item)
            for _, w in wrappers:
                if _extract_field_value(w) is not None:
                    fp += 1

        for g_item in unmatched_g:
            wrappers = _iter_field_wrappers(g_item)
            for _, w in wrappers:
                if _extract_field_value(w) is not None:
                    fn += 1

    # 4. Skills
    evaluate_section_list("skills", "skills", ["name"], ["name", "category", "candidate_confirmation_status"])

    # 5. Experience
    evaluate_section_list(
        "experience", "experience",
        ["employer", "role"],
        ["employer", "role", "location", "start_date", "end_date", "is_current"],
        ["responsibilities", "achievements", "technologies"]
    )

    # 6. Projects
    evaluate_section_list(
        "projects", "projects",
        ["name", "project_name"],
        ["name", "project_type", "description", "role", "start_date", "end_date"],
        ["technologies", "responsibilities", "outcomes", "links"]
    )

    # 7. Education
    evaluate_section_list(
        "education", "education",
        ["institution", "degree"],
        ["institution", "degree", "field_of_study", "start_date", "end_date", "grade", "location"]
    )

    # 8. Certifications
    evaluate_section_list(
        "certifications", "certifications",
        ["name"],
        ["name", "issuer", "issue_date", "expiration_date", "credential_id", "credential_url"]
    )

    # 9. Licences
    evaluate_section_list(
        "licences", "licences",
        ["name"],
        ["name", "issuer", "licence_number", "state_or_region", "issue_date", "expiration_date"]
    )

    # 10. Achievements
    evaluate_section_list(
        "achievements", "achievements",
        ["title"],
        ["title", "description", "date", "issuer"]
    )

    # 11. Publications
    evaluate_section_list(
        "publications", "publications",
        ["title"],
        ["title", "publisher", "date", "url", "description"]
    )

    # 12. Languages
    evaluate_section_list(
        "languages", "languages",
        ["language"],
        ["language", "proficiency"]
    )

    # 13. Volunteer Experience
    evaluate_section_list(
        "volunteer_experience", "volunteer_experience",
        ["organization", "role"],
        ["organization", "role", "start_date", "end_date", "description"]
    )

    # 14. Training
    evaluate_section_list(
        "training", "training",
        ["name"],
        ["name", "provider", "date", "details"]
    )

    # 15. Links
    evaluate_section_list(
        "links", "links",
        ["url", "label"],
        ["link_type", "url", "label"]
    )

    # 16. Additional Sections
    evaluate_section_list(
        "additional_sections", "additional_sections",
        ["heading"],
        ["heading"],
        ["items"]
    )

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    return precision, recall


def calculate_section_placement_accuracy(parsed: Dict[str, Any], golden: Dict[str, Any]) -> float:
    total_sections = 0
    correct_sections = 0

    section_keys = CONTENT_SECTION_KEYS
    for key in section_keys:
        p_has = bool(parsed.get(key))
        g_has = bool(golden.get(key))
        total_sections += 1
        if p_has == g_has:
            correct_sections += 1

    return correct_sections / total_sections if total_sections > 0 else 1.0


def calculate_experience_entry_accuracy(parsed: Dict[str, Any], golden: Dict[str, Any]) -> float:
    p_exp = parsed.get("experience", [])
    g_exp = golden.get("experience", [])

    if not p_exp and not g_exp:
        return 1.0
    if not p_exp or not g_exp:
        return 0.0

    matched = 0
    for p_item in p_exp:
        p_emp = _extract_field_value(p_item.get("employer") if isinstance(p_item, dict) else getattr(p_item, "employer", None))
        if not p_emp:
            continue
        for g_item in g_exp:
            g_emp = _extract_field_value(g_item.get("employer") if isinstance(g_item, dict) else getattr(g_item, "employer", None))
            if g_emp and str(p_emp).strip().casefold() in str(g_emp).strip().casefold():
                matched += 1
                break

    return matched / max(len(p_exp), len(g_exp))


def calculate_project_entry_accuracy(parsed: Dict[str, Any], golden: Dict[str, Any]) -> float:
    p_proj = parsed.get("projects", [])
    g_proj = golden.get("projects", [])

    if not p_proj and not g_proj:
        return 1.0
    if not p_proj or not g_proj:
        return 0.0

    matched = 0
    for p_item in p_proj:
        p_name = _extract_field_value(
            p_item.get("name") or p_item.get("project_name")
            if isinstance(p_item, dict)
            else getattr(p_item, "name", getattr(p_item, "project_name", None))
        )
        if not p_name:
            continue
        for g_item in g_proj:
            g_name = _extract_field_value(
                g_item.get("name") or g_item.get("project_name")
                if isinstance(g_item, dict)
                else getattr(g_item, "name", getattr(g_item, "project_name", None))
            )
            if g_name and str(p_name).strip().casefold() in str(g_name).strip().casefold():
                matched += 1
                break

    return matched / max(len(p_proj), len(g_proj))


def calculate_skill_contamination_rate(parsed: Dict[str, Any]) -> float:
    skills = parsed.get("skills", [])
    if not skills:
        return 0.0

    contaminated_count = 0
    for s in skills:
        s_name = str(_extract_field_value(s.get("name") if isinstance(s, dict) else getattr(s, "name", s)) or "")
        if len(s_name) > 120 or "•" in s_name or "responsib" in s_name.lower() or " developed " in s_name.lower() or " managed " in s_name.lower():
            contaminated_count += 1

    return contaminated_count / len(skills)


def calculate_unsupported_field_count(parsed: Dict[str, Any]) -> int:
    unsupported = 0
    for section in CONTENT_SECTION_KEYS:
        sec_data = parsed.get(section)
        if not sec_data:
            continue
        wrappers = _iter_field_wrappers(sec_data, path=section)
        for path, wrapper in wrappers:
            val = _extract_field_value(wrapper)
            ev = _extract_field_evidence(wrapper)
            if val is not None and not ev:
                unsupported += 1
    return unsupported


def calculate_evidence_coverage(parsed: Dict[str, Any]) -> float:
    total_populated = 0
    evidenced_populated = 0
    for section in CONTENT_SECTION_KEYS:
        sec_data = parsed.get(section)
        if not sec_data:
            continue
        wrappers = _iter_field_wrappers(sec_data, path=section)
        for path, wrapper in wrappers:
            val = _extract_field_value(wrapper)
            ev = _extract_field_evidence(wrapper)
            if val is not None:
                total_populated += 1
                if ev:
                    evidenced_populated += 1

    return evidenced_populated / total_populated if total_populated > 0 else 1.0


def calculate_duplicate_rate(parsed: Dict[str, Any]) -> float:
    skills = [
        str(_extract_field_value(s.get("name") if isinstance(s, dict) else getattr(s, "name", s))).strip().casefold()
        for s in parsed.get("skills", [])
        if _extract_field_value(s.get("name") if isinstance(s, dict) else getattr(s, "name", s))
    ]
    if not skills:
        return 0.0
    unique_skills = set(skills)
    duplicates = len(skills) - len(unique_skills)
    return duplicates / len(skills)


def calculate_omission_rate(parsed: Dict[str, Any], golden: Dict[str, Any]) -> float:
    _, recall = calculate_field_precision_and_recall(parsed, golden)
    return max(0.0, 1.0 - recall)


def calculate_determinism(run1: Dict[str, Any], run2: Dict[str, Any]) -> float:
    if run1 == run2:
        return 1.0

    all_keys = CONTENT_SECTION_KEYS + ["warnings", "unclassified_blocks"]
    matches = 0
    total = len(all_keys)
    for key in all_keys:
        v1 = run1.get(key)
        v2 = run2.get(key)
        if v1 == v2:
            matches += 1

    return matches / total if total > 0 else 1.0


def calculate_provider_failure_rate(results: List[Dict[str, Any]]) -> float:
    if not results:
        return 0.0
    failures = sum(1 for r in results if r.get("expected_status") in ["PROVIDER_FAIL", "ERROR"] or r.get("status") == "FAIL")
    return failures / len(results)


def calculate_grounding_enforcement_rate(parsed: Dict[str, Any]) -> float:
    unsupported = calculate_unsupported_field_count(parsed)
    coverage = calculate_evidence_coverage(parsed)
    if unsupported == 0 and coverage == 1.0:
        return 1.0
    return max(0.0, coverage - (unsupported * 0.05))


def evaluate_fixture_parse(
    parsed: Dict[str, Any],
    golden: Dict[str, Any],
    execution_time: float = 0.05,
    total_runs: int = 1,
    run2: Optional[Dict[str, Any]] = None,
) -> EvaluationResults:
    precision, recall = calculate_field_precision_and_recall(parsed, golden)
    sec_acc = calculate_section_placement_accuracy(parsed, golden)
    exp_acc = calculate_experience_entry_accuracy(parsed, golden)
    proj_acc = calculate_project_entry_accuracy(parsed, golden)
    skill_contam = calculate_skill_contamination_rate(parsed)
    unsupported_cnt = calculate_unsupported_field_count(parsed)
    ev_cov = calculate_evidence_coverage(parsed)
    dup_rate = calculate_duplicate_rate(parsed)
    omiss_rate = calculate_omission_rate(parsed, golden)
    det = calculate_determinism(parsed, run2 if run2 is not None else parsed)
    prov_fail = 0.0
    grounding_rate = calculate_grounding_enforcement_rate(parsed)

    return EvaluationResults(
        field_precision=precision,
        field_recall=recall,
        section_placement_accuracy=sec_acc,
        experience_entry_accuracy=exp_acc,
        project_entry_accuracy=proj_acc,
        skill_contamination_rate=skill_contam,
        unsupported_field_count=unsupported_cnt,
        evidence_coverage=ev_cov,
        duplicate_rate=dup_rate,
        omission_rate=omiss_rate,
        determinism=det,
        provider_failure_rate=prov_fail,
        average_parsing_time=execution_time,
        grounding_enforcement_rate=grounding_rate,
    )
