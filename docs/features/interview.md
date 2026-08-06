# Feature: Interview preparation & mock sessions

## Purpose

Practice with structured questions and optional preparation packs grounded in resume + JD evidence. **Answers are not AI-graded for hireability.**

## File map

| File | Role |
|------|------|
| `features/interview/preparation.py` | Evidence-grounded preparation packs |
| `features/interview/agent/question_generator.py` | Groq structured questions → template fallback |
| `features/interview/question_bank.py` | Local templates |
| `agents/prompts/interview_questions_v1.txt` | Question prompt |
| `api/router.py` | `/interviews*`, `/interview-preparation` |
| Frontend session UI | `features/interview/components/interview-flow.tsx` |
| Frontend prep | `features/interview/components/interview-preparation.tsx` |
| Voice helpers (pure) | `features/interview/interview-voice.ts` |

## Flows

### Preparation

```text
POST /interview-preparation
  confirmed resume_version_id + job_description_id
  → gaps from ATS evidence when available
  → question banks + optional Groq for missing skills
```

### Mock session

```text
POST /interviews
  mode, target_role, question_count
  camera_enabled / microphone_enabled (default true)
POST /interviews/{id}/start
  → generate_interview_questions (Groq or templates on any failure)
POST /interviews/{id}/responses
  typed_response and/or transcript (text only when media max is 0)
POST /interviews/{id}/complete
DELETE /interviews/{id}
```

### Browser live practice (frontend)

When mic/camera flags allow:

1. Request camera/mic via `getUserMedia` (preview only; not uploaded when media max is 0).  
2. Speak question with **Web Speech Synthesis**.  
3. Capture answer with **Web Speech Recognition** (`continuous` + interim results).  
4. Show live transcript in the answer box.  
5. Optional auto mode: silence → save → next question → speak again.  

Unsupported browsers fall back to typing. Recognition requires a secure context (localhost or HTTPS) and typically Chromium.

## Provider behavior

| Condition | Behavior |
|-----------|----------|
| Groq configured | Structured questions |
| Groq error / timeout / empty | **Templates** (session still starts) |
| NVIDIA | Not used for interview questions |

## Data

Collections: `interview_sessions`, `interview_questions`, `interview_responses`, `interview_reports`.

No AI score fields for grading answers as a hiring decision.

## Related

- [flows.md](../flows.md)  
- Tests: `backend/tests/interview/`, `frontend/src/features/interview/__tests__/`  
