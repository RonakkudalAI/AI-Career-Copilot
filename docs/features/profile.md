# Feature: Profile & completion

## Purpose

Maintain the candidate’s structured profile (identity, skills, experience, preferences) and a deterministic **completion checklist** (0–100). Optionally bootstrap fields from a resume via **preview → apply**.

## Why

| Choice | Why |
|--------|-----|
| Checklist not raised by resume upload alone | Upload ≠ confirmed profile ownership of facts |
| Preview → apply for AI fill | Human remains the writer of record |
| Preferred LLM then deterministic | `LLM_PROVIDER` order; offline mapping always available |
| Deterministic completion | Stable UX without LLM |

## File map

| File | Role |
|------|------|
| `features/profile/completion.py` | Checklist definition + score |
| `features/profile/avatars.py` | Avatar validation, storage, signed URL |
| `features/profile/importer.py` | Apply validated draft rows |
| `features/profile/agent/pipeline.py` | Fill-from-resume orchestration |
| `features/profile/agent/deterministic.py` | Non-LLM extraction/merge |
| `features/profile/agent/normalize.py` | Date/value normalization |
| `agents/prompts/fill_profile_from_resume_v1.txt` | Fill prompt (preferred LLM) |
| `database/repository.py` | `CANDIDATE_TABLES`, `recalculate_completion` |
| `api/router.py` | `/profile*`, `/me/bootstrap` |
| Frontend settings | `features/settings/components/settings.tsx` |
| Frontend completion UI | `features/profile/*` |

## Completion checklist

Defined in `completion.py` (`CHECKLIST`). Points sum to **100**:

| Key | Points |
|-----|-------:|
| full_name | 10 |
| location | 8 |
| current_role | 10 |
| target_roles | 8 |
| experience (or 0 years fresher) | 22 |
| skills | 17 |
| education | 10 |
| work_modes | 5 |
| preferred_locations | 5 |
| links | 5 |

Recalculated on profile mutations via `recalculate_completion` — not merely on page load.

## Child resources

API resource name → Firestore collection (`CANDIDATE_TABLES`):

```text
skills → candidate_skills
experiences → candidate_experiences
projects → candidate_projects
education → candidate_education
certifications → candidate_certifications
languages → candidate_languages
links → candidate_links
```

CRUD: `/profile/{resource}` in `api/router.py`.

## Fill from resume

```text
POST /profile/from-resume/preview
POST /profile/from-resume/preview-upload
  → pipeline: NVIDIA (if configured) + deterministic merge
  → draft JSON only

POST /profile/from-resume/apply
  → importer.insert_validated_batch
  → recalculate_completion
```

## Avatars

- Max size: `avatar_max_bytes`  
- Bucket prefix: `AVATAR_BUCKET`  
- URLs attached via signed or proxied download paths in `avatars.py`  

## Related

- [flows.md §6](../flows.md)  
- [data-model.md](../data-model.md)  
