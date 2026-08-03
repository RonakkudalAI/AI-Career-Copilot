import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.features.ats.agent import crew
from app.features.ats.scoring.schemas import (
    JDParsed,
    ExperienceEntry,
    GateResult,
    PARAMETER_KEYS,
    ResumeParsed,
    ScoreResult,
)
from app.features.ats.scoring.service import score_resume_jd


class ServiceTests(unittest.TestCase):
    def test_service_validates_blank_input(self):
        with self.assertRaises(Exception):
            asyncio.run(score_resume_jd(" ", "valid job description"))

    def test_service_returns_mocked_pipeline_result(self):
        expected = ScoreResult(
            gate=GateResult(decision="ALLOW", reason="matched"),
            parameter_scores={key: 80 for key in PARAMETER_KEYS},
            composite_score=80,
            reasons={key: "structured evidence" for key in PARAMETER_KEYS},
        )
        with patch("app.features.ats.scoring.service.run_pipeline", new=AsyncMock(return_value=expected)):
            result = asyncio.run(score_resume_jd("resume text", "job description"))
        self.assertEqual(result, expected)

    def test_pipeline_uses_mocked_crew_outputs_and_recomputes_composite(self):
        class Output:
            def __init__(self, value):
                self.pydantic = value

        class ParseCrew:
            def kickoff(self):
                return type(
                    "Result",
                    (),
                    {
                        "tasks_output": [
                            Output(
                                ResumeParsed(
                                    skills=["Python"],
                                    experience=[
                                        ExperienceEntry(
                                            role="Backend Engineer",
                                            company="Example Tech",
                                            industry_tags=["IT/Software"],
                                        )
                                    ],
                                    total_years_exp=4,
                                )
                            ),
                            Output(
                                JDParsed(
                                    domain="IT/Software",
                                    role_family="Backend Engineer",
                                    required_skills=["Python"],
                                )
                            ),
                        ]
                    },
                )()

        class GateCrew:
            def kickoff(self):
                return Output(GateResult(decision="ALLOW", reason="matched"))

        class ScoreCrew:
            def kickoff(self):
                return Output(
                    ScoreResult(
                        gate=GateResult(decision="ALLOW", reason="matched"),
                        parameter_scores={key: 50 for key in PARAMETER_KEYS},
                        composite_score=1,
                        reasons={key: "structured evidence" for key in PARAMETER_KEYS},
                    )
                )

        with patch.object(crew, "get_llm", return_value=object()), patch.object(
            crew, "build_agents", return_value={"resume_parser": object(), "jd_parser": object(), "domain_gate": object(), "scorer": object()}
        ), patch.object(crew, "build_resume_parse_task", return_value=object()), patch.object(
            crew, "build_jd_parse_task", return_value=object()
        ), patch.object(crew, "build_domain_gate_task", return_value=object()), patch.object(
            crew, "build_scoring_task", return_value=object()
        ), patch.object(crew, "_crewai_crew", side_effect=[ParseCrew(), GateCrew(), ScoreCrew()]):
            result = asyncio.run(crew.run_pipeline("resume", "job"))
        self.assertEqual(result.composite_score, 50)


if __name__ == "__main__":
    unittest.main()
