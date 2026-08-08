# Product flows

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — *How the project works* and *How each feature works*, plus Mermaid diagrams.

## Confirm gate (central)

```text
Upload/parse → review_required → (optional PATCH) → confirm → confirmed
```

Only **confirmed** resume versions and job descriptions feed ATS, learning (via ATS), interview prep evidence, and job-match evidence.

## Primary journey

1. Sign up / sign in → app JWT  
2. Profile / onboarding (optional fill-from-resume preview → apply)  
3. Upload resume → review sections → confirm  
4. Paste or upload JD → confirm  
5. Run ATS analysis → evidence + optional brief  
6. Optional: learning path, mock interview, job recommendations, resume improvement  
7. Re-upload revised resume and re-confirm to iterate  

## Feature flow sketches

### ATS

Confirmed resume + confirmed JD → fingerprint → `score_resume` (`evidence-keyword-coverage-v4`) → `ats_analyses` + `ats_evidence` → optional LLM brief.

### Interview

Create session → start (questions) → answer responses (evaluation) → complete (all answered) → report.

### Learning

Completed ATS → gap extract → plan search queries → materialize YouTube API / search URLs + allowlisted article searches → persist path.

### Jobs

Optional Adzuna sync into `jobs` → generate recommendations from confirmed resume evidence → save / pipeline statuses.

### Resume improvement

ATS evidence → gap crew task → LLM suggestions → evidence validate → accept/apply → new version / export.
