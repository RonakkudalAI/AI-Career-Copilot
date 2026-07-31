import unittest

from app.agents.ats_scoring.crew import evaluate_domain_gate
from app.ats.scoring.schemas import JDParsed, ExperienceEntry, ResumeParsed


def it_resume() -> ResumeParsed:
    return ResumeParsed(
        skills=["Python", "FastAPI", "SQL"],
        experience=[
            ExperienceEntry(
                role="Backend Engineer",
                company="Example Tech",
                industry_tags=["IT/Software"],
                summary_bullets=["Built backend services"],
            )
        ],
        total_years_exp=4,
    )


class DomainGateTests(unittest.TestCase):
    def test_it_resume_and_it_jd_are_allowed(self):
        result = evaluate_domain_gate(
            it_resume(),
            JDParsed(
                domain="IT/Software",
                role_family="Backend Engineer",
                required_skills=["Python", "FastAPI"],
            ),
        )
        self.assertEqual(result.decision, "ALLOW")

    def test_banking_resume_and_it_jd_are_rejected(self):
        resume = ResumeParsed(
            skills=["AML", "Risk Analysis"],
            experience=[
                ExperienceEntry(
                    role="Banking Analyst",
                    company="Example Bank",
                    industry_tags=["Banking"],
                )
            ],
        )
        result = evaluate_domain_gate(
            resume,
            JDParsed(
                domain="IT/Software",
                role_family="Backend Engineer",
                required_skills=["Python", "FastAPI"],
            ),
        )
        self.assertEqual(result.decision, "REJECT")
