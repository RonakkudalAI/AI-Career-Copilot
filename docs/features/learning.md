# Feature: Learning paths (ATS → YouTube)

## Purpose

Convert **completed ATS gaps** into a free YouTube study path. Video IDs must come from the **YouTube Data API** (or degrade to search-page URLs) — never from model hallucination.

## Algorithm version

`ats-youtube-api-v1` — `features/learning/youtube_catalog.py`

## Why crew shape

Three hard stages prevent the planner from inventing gaps or fake `watch?v=` links:

1. Gap extract (deterministic from `ats_evidence`)  
2. Lesson plan (queries only)  
3. Validate + materialize (API / search URLs only)  

## File map

| File | Role |
|------|------|
| `features/learning/service.py` | Public API used by router |
| `features/learning/agents/crew/orchestrator.py` | Sequential crew |
| `features/learning/agents/crew/tools.py` | Gap / plan / materialize tools |
| `features/learning/agents/crew/models.py` | Types |
| `features/learning/youtube_api.py` | YouTube Data API v3 client |
| `features/learning/youtube_catalog.py` | Version + helpers |
| `agents/prompts/learning_youtube_path_v1.txt` | Planner prompt |
| `api/router.py` | `/learning-paths*` |
| Frontend | `features/learning/components/learning.tsx` |

## Flow

```text
POST /learning-paths/generate  (optional source_analysis_id)
  require ≥1 completed ATS analysis
  load ats_evidence for source analysis
        │
  generate_learning_path_from_ats (service.py)
    run_learning_youtube_crew (orchestrator.py)
      1. extract_ats_gaps
           match_status in {not_found, partial_match}
      2. plan_youtube_lessons
           Groq or deterministic search queries (no video IDs)
      3. validate_and_materialize
           if YOUTUBE_API_KEY:
             search type=video, safeSearch=strict, embeddable
             store https://www.youtube.com/watch?v=<api_id>
           else:
             store YouTube search results page URL only
        │
  write learning_paths → learning_items → learning_resources
```

Progress:

```text
PATCH /learning-paths/{id}/items/{item_id}
  progress_percentage = completed_items / total * 100
```

## Runtime modes

Uses shared CrewAI-compatible runtime (`resume_improvement/agents/crew/compat.py`):

- Official `crewai` package if installed and Python allows  
- Built-in sequential orchestrator otherwise  

`GET /agents/status` reports readiness.

## Related

- [ATS feature](./ats-scoring.md) (evidence source)  
- [flows.md §7](../flows.md)  
- Tests: `backend/tests/learning/`  
