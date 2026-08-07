from app.features.interview.agent.evaluator import (
    analyze_filler_words,
    analyze_speaking_delivery,
    normalize_gaze_metrics,
    practice_readiness_recommendation,
    _deterministic_session_report,
    _score_answer_heuristic,
)


def test_analyze_filler_words_counts_common_fillers():
    text = "Um, I like, you know, fixed the bug because, uh, it was urgent."
    result = analyze_filler_words(text)
    assert result["total_count"] >= 3
    assert "um" in result["counts"] or "uh" in result["counts"] or "like" in result["counts"]
    assert result["word_count"] > 5
    assert result["notes"]


def test_score_answer_heuristic_rewards_structure():
    weak = _score_answer_heuristic("I fixed it.", "Tell me about a challenging bug.")
    strong = _score_answer_heuristic(
        "Recently in production I owned a checkout latency issue. "
        "The situation was p95 over 2 seconds. I profiled the API, reduced N+1 queries, "
        "and shipped a cache layer. The result was p95 under 400ms and fewer timeouts.",
        "Tell me about a challenging bug you fixed.",
    )
    assert strong["score"] > weak["score"]
    assert strong["verdict"] in {"partial", "solid", "strong"}
    assert "speaking_delivery" in strong


def test_speaking_delivery_measures_pace_from_duration():
    text = " ".join(["word"] * 60)
    delivery = analyze_speaking_delivery(text, duration_seconds=30)
    assert delivery["word_count"] == 60
    assert delivery["words_per_minute"] == 120.0
    assert delivery["pace_band"] == "steady"


def test_practice_readiness_is_not_a_hire_decision():
    high = practice_readiness_recommendation(
        overall_score=85,
        communication_score=80,
        structure_score=82,
        content_score=84,
        filler_rate=0.02,
    )
    assert high["band"] == "ready_to_interview"
    assert "not a hiring decision" in high["disclaimer"].lower()
    low = practice_readiness_recommendation(
        overall_score=30,
        communication_score=25,
        structure_score=28,
        content_score=32,
        filler_rate=0.12,
    )
    assert low["band"] == "build_fundamentals"


def test_normalize_gaze_metrics_does_not_invent_samples():
    assert normalize_gaze_metrics(None) is None
    assert normalize_gaze_metrics({}) is None
    gaze = normalize_gaze_metrics(
        {
            "sample_count": 10,
            "looking_samples": 7,
            "away_samples": 3,
            "no_face_samples": 0,
            "notes": "Keep facing the lens.",
            "detector": "face_detector",
        }
    )
    assert gaze is not None
    assert gaze["eye_contact_score"] == 70
    assert gaze["band"] == "strong"


def test_session_report_includes_gaze_and_empty_readiness():
    empty = _deterministic_session_report([], target_role="Engineer")
    assert empty["practice_readiness"]["band"] == "build_fundamentals"
    assert "gaze_summary" in empty

    full = _deterministic_session_report(
        [
            {
                "question_id": "1",
                "position": 1,
                "question": "Tell me about a challenge.",
                "answer": "I led a fix and shipped measurable impact.",
                "evaluation": {
                    "score": 72,
                    "verdict": "solid",
                    "strengths": ["clear"],
                    "improvements": [],
                    "filler_analysis": {"total_count": 0, "word_count": 10, "filler_rate": 0},
                    "speaking_delivery": {"words_per_minute": 130},
                    "gaze_metrics": {
                        "sample_count": 8,
                        "looking_samples": 6,
                        "away_samples": 2,
                        "no_face_samples": 0,
                        "detector": "face_detector",
                    },
                },
            }
        ],
        target_role="Engineer",
    )
    assert full["gaze_summary"]["average_eye_contact_score"] == 75
    assert full["practice_readiness"]["dimension_scores"].get("eye_contact") == 75
