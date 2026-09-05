from __future__ import annotations

import math
import re
from typing import Any

_STAR_MARKERS = (
    "situation",
    "task",
    "action",
    "result",
    "because",
    "i led",
    "i owned",
    "we shipped",
    "impact",
    "outcome",
    "measured",
)

_EXAMPLE_MARKERS = (
    "for example",
    "for instance",
    "when i",
    "one time",
    "recently",
    "last year",
    "on a project",
    "at my last",
)

_RESULT_MARKERS = (
    "result",
    "outcome",
    "impact",
    "shipped",
    "reduced",
    "increased",
    "improved",
    "saved",
    "grew",
    "%",
    "percent",
)

_ACTION_MARKERS = (
    "i led",
    "i owned",
    "i built",
    "i shipped",
    "i fixed",
    "i designed",
    "i implemented",
    "i decided",
    "i ran",
    "we shipped",
    "we built",
    "i changed",
    "i moved",
    "profiled",
    "debugged",
    "migrated",
)


def is_follow_up_question(source_context: dict[str, Any] | None) -> bool:
    if not isinstance(source_context, dict):
        return False
    return str(source_context.get("kind") or "").strip().lower() == "follow_up"


def follow_up_budget(seed_count: int | None) -> int:
    count = max(1, min(int(seed_count or 5), 20))
    return min(2, max(1, math.ceil(count / 3)))


def _move_on(reply: str = "Alright, thanks.") -> dict[str, Any]:
    return {
        "should_follow_up": False,
        "follow_up_question": None,
        "spoken_reply": reply,
    }


def _follow_up(question: str, reply: str = "Okay — stay with that for a second.") -> dict[str, Any]:
    return {
        "should_follow_up": True,
        "follow_up_question": question,
        "spoken_reply": reply,
    }


def decide_interviewer_turn(
    *,
    answer: str,
    question: str,
    question_type: str | None = None,
    already_followed_up: bool = False,
    follow_ups_used: int = 0,
    seed_count: int = 5,
) -> dict[str, Any]:
    """Instant interviewer brain. Default is to move on; follow-ups are earned.

    A real interviewer does not probe every answer. Empty or one-line answers
    still get a second beat. Complete-enough answers move on.
    """
    text = (answer or "").strip()
    words = re.findall(r"[A-Za-z']+", text.lower())
    word_count = len(words)
    lower = text.lower()
    q = (question or "").strip().lower()
    kind = (question_type or "").strip().lower()
    star_hits = sum(1 for marker in _STAR_MARKERS if marker in lower)
    has_example = any(token in lower for token in _EXAMPLE_MARKERS)
    has_result = any(token in lower for token in _RESULT_MARKERS)
    has_action = any(token in lower for token in _ACTION_MARKERS)
    behavioural = kind in {"behavioural", "behavioral", "hr", "situational"} or any(
        token in q for token in ("tell me about", "a time", "example", "conflict", "challenge")
    )
    budget = follow_up_budget(seed_count)
    used = max(0, int(follow_ups_used or 0))

    if already_followed_up or used >= budget:
        return _move_on("Thanks, that helps.")
    if not text:
        return _follow_up(
            "Take another pass — what happened, what did you do, and how did it turn out?",
            "I didn't quite catch that.",
        )
    if word_count < 8:
        return _follow_up(
            "Give me a bit more — what was going on, and what did you actually do?",
            "That's a start. Stay with it.",
        )

    missing_action = not has_action and star_hits < 1
    missing_result = not has_result
    missing_example = not has_example and word_count < 22
    holes = int(missing_action) + int(missing_result) + int(missing_example)

    if behavioural and holes >= 2 and word_count < 36:
        if missing_action:
            return _follow_up("What did you personally do in that situation?")
        if missing_result:
            return _follow_up("What changed because of that — for you, the team, or the product?")
        return _follow_up("Can you give me one concrete instance of that?")

    if not behavioural and word_count < 10:
        return _follow_up("Walk me through that a little more — how would you actually approach it?")

    return _move_on("Okay, that was clear." if word_count >= 28 else "Alright, thanks.")


def merge_interviewer_turn(
    llm_turn: dict[str, Any] | None,
    heuristic: dict[str, Any],
    *,
    already_followed_up: bool,
) -> dict[str, Any]:
    """Prefer a valid LLM spoken reply. Heuristic vetoes unearned follow-ups."""
    if already_followed_up:
        return {
            "should_follow_up": False,
            "follow_up_question": None,
            "spoken_reply": (
                str((llm_turn or {}).get("spoken_reply") or heuristic.get("spoken_reply") or "")
                .strip()
                or "Thanks, that helps."
            )[:500],
        }
    payload = llm_turn if isinstance(llm_turn, dict) else {}
    spoken = str(payload.get("spoken_reply") or heuristic.get("spoken_reply") or "").strip()
    heuristic_should = bool(heuristic.get("should_follow_up"))
    llm_should = payload.get("should_follow_up")
    # LLM may skip a probe. It may not force a follow-up the heuristic rejected.
    if not heuristic_should or llm_should is False:
        follow = ""
        should = False
        if not spoken:
            spoken = str(heuristic.get("spoken_reply") or "Alright, thanks.")
    else:
        follow = str(payload.get("follow_up_question") or heuristic.get("follow_up_question") or "").strip()
        should = len(follow) >= 8
        if not should:
            follow = ""
            if not spoken:
                spoken = str(heuristic.get("spoken_reply") or "Alright, thanks.")
    return {
        "should_follow_up": should,
        "follow_up_question": follow[:800] if follow else None,
        "spoken_reply": (spoken or "Alright, thanks.")[:500],
    }


def max_question_budget(session: dict[str, Any]) -> int:
    planned = int(session.get("question_count") or 5)
    planned = max(1, min(planned, 20))
    return min(20, planned + follow_up_budget(planned))
