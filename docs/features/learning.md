# Learning paths — how it works

**Canonical:** [../DOCUMENTATION.md](../DOCUMENTATION.md) §7.7.

## Goal

Turn ATS gaps into free learning steps **without inventing video IDs or article URLs**.

## Algorithm

`ats-mixed-learning-v1` (`youtube_catalog.py`).

```text
completed ATS analysis
  → extract gaps (not_found / partial_match)
  → plan search queries (LLM or deterministic)
  → materialize resources:
       · YouTube Data API → real watch?v= IDs
       · or YouTube search page URLs only
       · + allowlisted educational search URLs (docs, MDN, etc.)
  → persist learning_paths + items + resources
```

## Crew

`features/learning/agents/crew/orchestrator.py` runs sequential tools: gap extract → plan → validate/materialize.

## Progress

`PATCH /learning-paths/{id}/items/{item_id}` updates item status and recalculates path `progress_percentage`.

## Key files

- `features/learning/service.py`  
- `features/learning/youtube_api.py`, `youtube_catalog.py`, `article_catalog.py`  
- `features/learning/agents/crew/*`  
- Frontend: `features/learning/components/learning.tsx`
