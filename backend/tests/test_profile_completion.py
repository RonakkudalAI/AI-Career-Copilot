from app.profile_completion import calculate_profile_completion


def test_empty_profile_has_no_completion():
    assert calculate_profile_completion({})[0] == 0


def test_basic_and_career_partial_completion():
    percentage, details = calculate_profile_completion(
        {
            "profile": {"full_name": "A Candidate", "location": "Pune", "current_role": "Analyst"},
            "preferences": {"target_roles": ["Analyst"]},
        }
    )
    assert percentage == 30
    assert details["basic"] == 15
    assert details["career"] == 15


def test_zero_years_experience_counts_without_jobs():
    percentage, details = calculate_profile_completion(
        {
            "profile": {"years_experience": 0},
            "no_experience_declared": True,
            "has_experience": False,
        }
    )
    assert details["experience"] == 20
    assert percentage == 20


def test_complete_profile_reaches_one_hundred():
    profile = {
        "full_name": "A Candidate",
        "headline": "Analyst",
        "phone": "+91 99999 99999",
        "location": "Pune",
        "current_role": "Analyst",
        "years_experience": 3,
        "bio": "Evidence-led analyst",
    }
    preferences = {
        "target_roles": ["Senior Analyst"],
        "preferred_locations": ["Pune"],
        "work_modes": ["hybrid"],
    }
    context = {
        "profile": profile,
        "preferences": preferences,
        "has_experience": True,
        "skill_count": 1,
        "education_count": 1,
        "link_count": 1,
        "has_valid_resume": True,
    }
    assert calculate_profile_completion(context)[0] == 100
