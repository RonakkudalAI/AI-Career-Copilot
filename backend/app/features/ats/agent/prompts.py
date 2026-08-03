RESUME_PARSE_PROMPT = """
Parse the supplied resume into ONLY valid JSON matching the ResumeParsed schema.
Use only facts explicitly present in the resume. Do not infer employers, dates,
skills, degrees, certifications, or years of experience. Skills must be concrete
hard skills or tool names. Do not put skills inside experience summary_bullets,
and do not put education inside skills. Use empty lists or empty strings when
the resume does not provide a value.
""".strip()

JD_PARSE_PROMPT = """
Parse the supplied job description into ONLY valid JSON matching the JDParsed
schema. Identify an explicit domain and role_family. Separate required_skills
from preferred_skills. Extract the minimum experience requirement and mandatory
criteria only when stated or clearly required by the text. Do not invent a
company, technology, qualification, location, visa condition, or experience
requirement.
""".strip()

DOMAIN_GATE_PROMPT = """
Evaluate whether the parsed resume is in-domain for the parsed job description.
Output ONLY valid JSON matching GateResult with decision ALLOW or REJECT.
Reject when the domains mismatch and overlap(required_skills, resume.skills) is
less than 0.15. Also reject when no experience entry matches the JD role_family
and industry. Explain the evidence used in one concise reason. Do not reject
based on missing preferred skills alone.
""".strip()

SCORING_PROMPT = """
Score only the supplied ResumeParsed and JDParsed JSON. Output ONLY valid JSON
matching ScoreResult. Score every parameter from 0 to 100:
hard_skill_match, experience_relevance, education_match,
certifications_match, seniority_alignment. Compute exactly:
0.4*hard_skill_match + 0.25*experience_relevance + 0.15*education_match
+ 0.10*certifications_match + 0.10*seniority_alignment.
Keep explanations short and evidence-based. Do not use raw resume or JD text,
and do not claim a missing item is absent beyond the supplied structured data.
""".strip()
