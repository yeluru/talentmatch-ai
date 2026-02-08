# Production migration checklist

**Use this as the single reference when deploying to production.** It lists every migration, RPC, and manual SQL we added so nothing is missed.

---

## 1. Database migrations (run in order)

Either run `npx supabase db push` (so they apply in timestamp order) or run these migrations manually in this order:

| Order | Migration file | What it does |
|-------|----------------|--------------|
| 1 | `20260131100000_account_manager_can_update_candidate_notes.sql` | RLS: account managers can UPDATE `candidate_profiles.recruiter_notes` for org candidates (optional if RPC is used). |
| 2 | `20260131110000_staff_update_candidate_notes_rpc.sql` | **Required.** Creates RPC `update_candidate_recruiter_notes(_candidate_id, _notes)` + GRANTs. Used for saving comments everywhere. |
| 3 | `20260207120000_fix_engagement_rls_for_staff.sql` | Trigger `ensure_application_for_engagement` → SECURITY DEFINER; applications UPDATE policy allows staff (recruiter + account_manager + org_admin). |
| 4 | `20260207130000_start_engagement_rpc.sql` | **Required.** Creates RPC `start_engagement(_candidate_id, _job_id)` + GRANTs. Used when starting an engagement from Talent Pool (avoids RLS errors). |
| 5 | `20260207140000_update_application_status_rpc.sql` | **Required.** Creates RPC `update_application_status(_application_id, _status, _candidate_id, _outcome, _recruiter_notes)` + GRANTs. Used for all pipeline moves (RTR, screening, document check, submission, outcome, drag-to-stage) so recruiter/AM work without RLS blocking. |

---

## 2. If an RPC is missing after push (run in SQL Editor)

Sometimes `db push` doesn’t create the function or the schema cache doesn’t see it. If the app errors with “could not find the function public.…”, run the matching SQL file **once** in **Supabase Dashboard → SQL Editor**:

| Error / feature | Run this file (copy entire contents into SQL Editor) |
|-----------------|------------------------------------------------------|
| Comments not saving / “Could not find … update_candidate_recruiter_notes” | `supabase/migrations/RUN_IF_RPC_MISSING_update_candidate_recruiter_notes.sql` |
| Start engagement fails / “Could not find … start_engagement” | `supabase/migrations/RUN_IF_MISSING_start_engagement.sql` |
| Pipeline move doesn’t persist (e.g. RTR says moved but candidate stays) / “Could not find … update_application_status” | `supabase/migrations/RUN_IF_MISSING_update_application_status.sql` |

---

## 3. RPCs that must exist in prod

The app depends on these three functions. If any is missing, use the manual SQL in section 2.

| RPC | Purpose |
|-----|--------|
| `public.update_candidate_recruiter_notes(_candidate_id uuid, _notes text)` | Save recruiter/AM comments on candidates (pipeline, talent pool, shortlists, applicant detail). |
| `public.start_engagement(_candidate_id uuid, _job_id uuid)` | Start engagement from Talent Pool (creates engagement + application without RLS blocking). |
| `public.update_application_status(_application_id, _status, _candidate_id, _outcome, _recruiter_notes)` | All pipeline status moves (RTR, screening, document check, submission, outcome, drag between stages); used so recruiter/AM moves persist. |

---

## 4. App behavior that depends on this

- **AM pipeline view**  
  - AM cannot move candidates; sees: “You cannot move this candidate as the pipeline is owned by {name}.”  
  - AM can add/save comments (via `update_candidate_recruiter_notes`).

- **Comments/notes**  
  - All `candidate_profiles.recruiter_notes` updates go through `update_candidate_recruiter_notes` in: CandidatePipeline, TalentDetailSheet, TalentPoolRow, ApplicantDetailSheet, ShortlistCandidateCard.

- **Start engagement**  
  - Talent Pool “Start engagement” calls `start_engagement` RPC (no direct table writes).

- **Pipeline status moves (RTR, screening, document check, submission, outcome, drag)**  
  - All status updates go through `update_application_status` RPC (no direct applications/candidate_profiles updates). RTR flow awaits the update before showing “RTR email sent and candidate moved.”

- **Role switch (AM → Recruiter)**  
  - URL `?owner=` is stripped when switching to recruiter; recruiter-scoped queries are invalidated so no stale pipeline/data.

- **Pipeline UI**  
  - “Viewing {name}'s application pipeline.” is plain red text with gap below; no ribbon.  
  - EngagementPipeline banner: “Viewing {name}'s pipeline.”  
  - Recruiter dashboard: “Suggested next steps” section removed.

- **Start engagement (applications)**  
  - Applications upsert no longer uses `ignoreDuplicates` so existing applications are updated to `outreach` when starting engagement.

---

## 5. Quick prod steps

1. Deploy the app (frontend/build as usual).
2. Run migrations: `npx supabase db push` (or run the five migration files in section 1 in order).
3. If the app reports a missing function: run the corresponding SQL from section 2 in Supabase SQL Editor.
4. Optionally reload schema cache in Supabase if needed.

After that, AM pipeline, comments, start engagement, and role switch should all work in prod.
