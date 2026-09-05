# Mock interview — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.6.

## Goal

Practice coaching for mock interviews — **not** a recruiter hire/no-hire decision.

## Session lifecycle

```text
POST /interviews
  → POST /interviews/{id}/start     # generate questions
  → POST /interviews/{id}/responses # answer (+ evaluation)
  → POST /interviews/{id}/complete  # requires every question answered
  → GET  /interviews/{id}/report
```

## Subsystems

| Piece | Behavior |
|-------|----------|
| Questions | Groq structured JSON; templates if fail/unconfigured |
| Preparation | Evidence packs from confirmed resume + JD |
| TTS | Groq Orpheus, then NVIDIA Magpie, then Fish Audio (`POST /interviews/tts`); browser speechSynthesis last |
| STT | Browser Web Speech API |
| Gaze | Client metrics; server normalizes without inventing samples |
| Evaluation | Score, strengths, improvements, fillers, pace (coaching) |
| Report | Session summary + dimension scores (`evidence-report-v2`) |

## Frontend

`interview-flow.tsx` drives the session UI. Helpers: `interview-voice.ts`, `interview-tts.ts`, `interview-gaze.ts`. Dashboard charts use bootstrap `interview_progress`.

## Key files

- `features/interview/agent/question_generator.py`  
- `features/interview/agent/evaluator.py`  
- `features/interview/preparation.py`, `tts.py`  
- `api/router.py` interview handlers  
