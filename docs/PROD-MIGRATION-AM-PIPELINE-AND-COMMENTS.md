# AM pipeline & comments (reference)

**→ For production deployment, use the single checklist: [PROD-MIGRATION-CHECKLIST.md](./PROD-MIGRATION-CHECKLIST.md)**

That doc lists all migrations, both RPCs (`update_candidate_recruiter_notes`, `start_engagement`), manual SQL fallbacks, and app behavior. This file is kept only as a short reference for the AM pipeline and comments feature.

- **AM pipeline:** Cannot move candidates; can save comments (via RPC).
- **Comments:** All recruiter_notes updates use `update_candidate_recruiter_notes` (pipeline, talent pool, shortlists, applicant detail).
- **If RPC missing:** Run `RUN_IF_RPC_MISSING_update_candidate_recruiter_notes.sql` in SQL Editor.
