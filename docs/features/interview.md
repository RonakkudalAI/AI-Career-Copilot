# Feature: Interview preparation & mock sessions

## Purpose

Help candidates practice with structured questions and optional preparation packs grounded in resume + JD evidence. **Answers are not AI-graded for hireability.**

## Why no AI grading

Avoids false precision and invented evaluations. The product stores practice artifacts only.

## File map

| File | Role |
|------|------|
| `features/interview/preparation.py` | Evidence-grounded preparation packs |
| `features/interview/agent/question_generator.py` | Groq structured questions |
| `features/interview/question_bank.py` | Local templates when LLM off |
| `agents/prompts/interview_questions_v1.txt` | Question prompt |
| `agents/prompts/interview_preparation_v1.txt` | Prep prompt |
| `api/router.py` | `/interviews*`, `/interview-preparation` |
| Frontend | `features/interview/components/interview-flow.tsx` |
| Frontend prep | `features/interview/components/interview-preparation.tsx` |
| Frontend helpers | `features/interview/preparation.ts` |

## Flows

### Preparation

```text
POST /interview-preparation
  inputs: resume/JD evidence context
  → preparation.py generates question pack / focus areas
  → persisted or returned per route contract
```

### Mock session

```text
POST /interviews                 create session (mode, role, difficulty, counts)
POST /interviews/{id}/start      generate questions (Groq or templates)
POST /interviews/{id}/responses  store typed/transcript/media refs
POST /interviews/{id}/complete   mark completed
DELETE /interviews/{id}          remove session graph
```

Media uploads honor `interview_media_max_bytes` (0 disables media).

## Provider behavior

| Condition | Behavior |
|-----------|----------|
| `GROQ_API_KEY` set | Structured questions via Groq client |
| Groq unavailable | `question_bank.py` templates |
| NVIDIA | Not used for interview questions (registry documents this) |

## Data

Collections: `interview_sessions`, `interview_questions`, `interview_responses`, `interview_reports`.

## Related

- [flows.md §8](../flows.md)  
- [agents registry](../code-map.md)  
- Tests: `backend/tests/interview/`  
