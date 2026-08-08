# Profile — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.3.

## Goal

Maintain a structured candidate profile, completion score, avatar, and optional fill-from-resume draft with a human apply gate.

## Completion

`features/profile/completion.py` scores checklist items to **0–100**. `recalculate_completion` runs after mutations (skills, experience, preferences, etc.).

## Resources

CRUD under `/profile/{resource}` for:

`skills` · `experiences` · `projects` · `education` · `certifications` · `languages` · `links`

## Fill-from-resume

1. Load resume version (confirmed preferred; any text version allowed for this flow).  
2. Optional AI extract (preferred LLM) + deterministic mapping.  
3. Evidence filter against resume text.  
4. **Preview** returns a draft (no writes).  
5. **Apply** writes only selected rows via importer.

Also: upload-while-filling stores a resume parent + version for later ATS use.

## Avatar

Upload validates JPEG/PNG/WebP size → storage path under `{user_id}/avatars/` → profile `avatar_path` → browser URL via authenticated `/api/files/...`.

## Key files

- `features/profile/completion.py`, `avatars.py`, `importer.py`  
- `features/profile/agent/{pipeline,deterministic,normalize}.py`  
- Frontend: settings + onboarding + profile-completion toast
