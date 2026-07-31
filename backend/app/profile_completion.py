"""
Profile completion scoring — deterministic and auditable.

Total = 100 points across checklist items that match what the profile UI collects.
Each item is scored only from real DB context (no invented requirements).
Resume upload/confirm is intentionally NOT part of profile completion.
"""

from __future__ import annotations

from typing import Any


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set)):
        return any(_present(item) for item in value)
    if isinstance(value, dict):
        return any(_present(item) for item in value.values())
    if isinstance(value, bool):
        return value
    # numbers (including 0 years experience) count as provided when checked separately
    if isinstance(value, (int, float)):
        return True
    return bool(value)


def _has_nonempty_list(value: Any) -> bool:
    if not isinstance(value, (list, tuple)):
        return False
    return any(_present(item) for item in value)


# Point weights sum to 100 — profile fields only (no resume criterion).
CHECKLIST: list[dict[str, Any]] = [
    {
        "key": "full_name",
        "label": "Full name",
        "points": 10,
        "group": "basic",
        "href": "/settings/profile",
    },
    {
        "key": "location",
        "label": "Location",
        "points": 8,
        "group": "basic",
        "href": "/settings/profile",
    },
    {
        "key": "current_role",
        "label": "Current role",
        "points": 10,
        "group": "career",
        "href": "/settings/profile",
    },
    {
        "key": "target_roles",
        "label": "Target roles",
        "points": 8,
        "group": "career",
        "href": "/settings/profile",
    },
    {
        "key": "experience",
        "label": "Work experience (or mark 0 years if fresher)",
        "points": 22,
        "group": "experience",
        "href": "/settings/profile",
    },
    {
        "key": "skills",
        "label": "At least one skill",
        "points": 17,
        "group": "skills",
        "href": "/settings/profile",
    },
    {
        "key": "education",
        "label": "Education",
        "points": 10,
        "group": "education",
        "href": "/settings/profile",
    },
    {
        "key": "work_modes",
        "label": "Preferred work modes",
        "points": 5,
        "group": "preferences",
        "href": "/settings/profile",
    },
    {
        "key": "preferred_locations",
        "label": "Preferred job locations",
        "points": 5,
        "group": "preferences",
        "href": "/settings/profile",
    },
    {
        "key": "links",
        "label": "Professional link (LinkedIn, GitHub, etc.)",
        "points": 5,
        "group": "links",
        "href": "/settings/profile",
    },
]

# Known checklist keys — used to drop stale items (e.g. old "resume") from stored details.
CHECKLIST_KEYS = frozenset(str(item["key"]) for item in CHECKLIST)


def _item_complete(key: str, context: dict[str, Any]) -> bool:
    """Score a single checklist key from real context only — unknown keys are incomplete."""
    profile = context.get("profile") if isinstance(context.get("profile"), dict) else {}
    preferences = context.get("preferences") if isinstance(context.get("preferences"), dict) else {}

    if key == "full_name":
        return _present(profile.get("full_name"))
    if key == "location":
        return _present(profile.get("location"))
    if key == "current_role":
        return _present(profile.get("current_role"))
    if key == "target_roles":
        return _has_nonempty_list(preferences.get("target_roles"))
    if key == "experience":
        # Work history rows, or explicit fresher declaration (years_experience == 0).
        return bool(context.get("has_experience") or context.get("no_experience_declared"))
    if key == "skills":
        try:
            return int(context.get("skill_count") or 0) > 0
        except (TypeError, ValueError):
            return False
    if key == "education":
        try:
            return int(context.get("education_count") or 0) > 0
        except (TypeError, ValueError):
            return False
    if key == "work_modes":
        return _has_nonempty_list(preferences.get("work_modes"))
    if key == "preferred_locations":
        return _has_nonempty_list(preferences.get("preferred_locations"))
    if key == "links":
        try:
            return int(context.get("link_count") or 0) > 0
        except (TypeError, ValueError):
            return False
    return False


def checklist_total_points() -> int:
    return sum(int(item["points"]) for item in CHECKLIST)


def calculate_profile_completion(context: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """
    Returns (percentage 0–100, details).

    details includes:
      - legacy group scores (basic, career, …) for compatibility
      - checklist status per field
      - missing[] with human labels (for toast / UI)
    """
    if not isinstance(context, dict):
        context = {}

    checklist: dict[str, bool] = {}
    missing: list[dict[str, Any]] = []
    completed: list[dict[str, Any]] = []
    group_scores: dict[str, int] = {
        "basic": 0,
        "career": 0,
        "experience": 0,
        "skills": 0,
        "education": 0,
        "preferences": 0,
        "links": 0,
    }
    total = 0
    max_points = checklist_total_points() or 100

    for item in CHECKLIST:
        key = str(item["key"])
        points = int(item["points"])
        group = str(item["group"])
        done = _item_complete(key, context)
        checklist[key] = done
        entry = {
            "key": key,
            "label": str(item["label"]),
            "points": points,
            "group": group,
            "href": str(item.get("href") or "/settings/profile"),
        }
        if done:
            total += points
            group_scores[group] = group_scores.get(group, 0) + points
            completed.append(entry)
        else:
            missing.append(entry)

    # Percentage is exact sum of completed weights (designed to total 100).
    if max_points == 100:
        percentage = max(0, min(100, int(total)))
    else:
        percentage = max(0, min(100, int(round((total / max_points) * 100))))

    missing_points = sum(int(m["points"]) for m in missing)
    completed_points = sum(int(c["points"]) for c in completed)

    details: dict[str, Any] = {
        **group_scores,
        "total": percentage,
        "max": 100,
        "weight_sum": max_points,
        "completed_points": completed_points,
        "missing_points": missing_points,
        "checklist": checklist,
        "missing": missing,
        "completed": completed,
        "missing_count": len(missing),
        "completed_count": len(completed),
    }
    return percentage, details
