from typing import Any


def _present(value: Any) -> bool:
    return bool(value) if not isinstance(value, str) else bool(value.strip())


def calculate_profile_completion(context: dict[str, Any]) -> tuple[int, dict[str, int]]:
    profile = context.get("profile") or {}
    preferences = context.get("preferences") or {}
    details = {
        "basic": 15 if _present(profile.get("full_name")) and _present(profile.get("location")) else 0,
        "career": 15
        if _present(profile.get("current_role")) and _present(preferences.get("target_roles"))
        else 0,
        "experience": 20 if context.get("has_experience") or context.get("no_experience_declared") else 0,
        "skills": 15 if context.get("skill_count", 0) > 0 else 0,
        "education": 10 if context.get("education_count", 0) > 0 else 0,
        "preferences": 10
        if _present(preferences.get("work_modes")) and _present(preferences.get("preferred_locations"))
        else 0,
        "resume": 10 if context.get("has_valid_resume") else 0,
        "links": 5 if context.get("link_count", 0) > 0 else 0,
    }
    return sum(details.values()), details
