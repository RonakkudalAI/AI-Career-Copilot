from app.features.interview.agent.evaluator import analyze_filler_words, _score_answer_heuristic


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
