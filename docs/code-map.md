# Code map

**Canonical:** [DOCUMENTATION.md](./DOCUMENTATION.md) — section *Code map*.

High-level layout:

```text
frontend/src/features/   # UI by product area
frontend/src/shared/     # api client, theme, config, routes
backend/app/api/         # HTTP routes + schemas
backend/app/features/    # domain logic per feature
backend/app/agents/      # LLM providers + prompts + registry
backend/app/database/    # Firestore + Supabase adapters
backend/app/core/        # settings, errors
scripts/                 # setup, dev, diagnostics
docs/                    # this documentation set
```

For the file-by-file purpose table, use the canonical document.
