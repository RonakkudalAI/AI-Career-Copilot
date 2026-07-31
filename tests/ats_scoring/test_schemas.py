import unittest

from app.ats.scoring.schemas import GateResult, PARAMETER_KEYS, ScoreResult


class ScoreSchemaTests(unittest.TestCase):
    def test_score_requires_all_parameter_keys(self):
        with self.assertRaises(ValueError):
            ScoreResult(
                gate=GateResult(decision="ALLOW", reason="matched"),
                parameter_scores={"hard_skill_match": 90},
                composite_score=90,
                reasons={"hard_skill_match": "matched"},
            )

    def test_rejected_candidate_must_have_zero_score(self):
        with self.assertRaises(ValueError):
            ScoreResult(
                gate=GateResult(decision="REJECT", reason="out of domain"),
                parameter_scores={key: 0 for key in PARAMETER_KEYS},
                composite_score=1,
                reasons={key: "not scored" for key in PARAMETER_KEYS},
            )
