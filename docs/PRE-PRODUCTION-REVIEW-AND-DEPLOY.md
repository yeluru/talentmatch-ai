# Pre-production review and deployment (UltraHire)

**Frontend:** Render  
**Database / Auth / Edge:** Supabase (production)  
**Env:** Already configured and working.

Use this doc to: (1) review findings, (2) commit and push, (3) run migrations, (4) test after deploy.

---

## 1. Code review summary

### 1.1 What was checked

- **Git:** Many modified and untracked files; nothing committed for recent AM/pipeline, manager candidates, and RPC work.
- **Secrets:** No hardcoded production secrets in app code. `env.example` documents required vars; Supabase client uses `VITE_SUPABASE_*` in production.
- **Local override:** `src/integrations/supabase/client.ts` forces local Supabase on `localhost` / `127.0.0.1`; production Render URL will use env and hit prod Supabase. OK.
- **Routes:** `/manager/candidates` and ManagerCandidates are wired in `App.tsx` and `DashboardLayout`. Deleted `ManagerAnalytics` is not referenced.
- **Console usage:** A few `console.log` / `console.debug` / `console.warn` in `useAuth`, `AIAgents`, `TalentPool`, `Shortlists`, etc. They are non-blocking; you can reduce or guard with `import.meta.env.DEV` later if desired.

### 1.2 Recommendations (optional, not blocking)

- **Console:** Consider wrapping debug logs in `if (import.meta.env.DEV)` so they don’t run in production builds.
- **Local Supabase key:** `client.ts` has a hardcoded local anon key for localhost. If that key is ever rotated, update it there (or use env for local too).

### 1.3 No blocking issues found

No hardcoded prod URLs, no missing routes for new pages, and RPC/migration docs are in place.

---

## 2. Commit and push to `main`

Run from repo root:

```bash
cd /Users/raviyeluru/ultrahire/talentmatch-ai

# Stage all changes (modified, new, and deleted)
git add -A

# Review what will be committed
git status

# Commit with a clear message
git commit -m "Production prep: AM pipeline, comments RPC, start_engagement & update_application_status RPCs, manager candidates by job, pipeline stages, RUN_IF_MISSING scripts and docs"

# Push to main
git push origin main
```

If you prefer to exclude certain files (e.g. extra docs or PDFs), adjust `git add` (e.g. `git add src supabase env.example docs/PROD-MIGRATION-CHECKLIST.md docs/PRE-PRODUCTION-REVIEW-AND-DEPLOY.md` and add a `.gitignore` entry if needed), then commit and push.

---

## 3. Database: migrations and RPCs in production

Production already has earlier migrations. You need to apply **only the new ones** and ensure the **three RPCs** exist.

### 3.1 Option A: Supabase CLI (recommended if you use it)

From repo root, linked to **production** project:

```bash
npx supabase db push
```

This runs any migrations that haven’t been applied yet, in order.

### 3.2 Option B: Run migrations manually in SQL Editor

If you don’t use `db push`, run these in **Supabase Dashboard → SQL Editor** in this order (only if not already applied in prod):

| Order | Migration file | Purpose |
|-------|----------------|---------|
| 1 | `20260131100000_account_manager_can_update_candidate_notes.sql` | RLS for AM to update recruiter_notes (optional if using RPC only). |
| 2 | `20260131110000_staff_update_candidate_notes_rpc.sql` | Creates `update_candidate_recruiter_notes`. **Required.** |
| 3 | `20260207120000_fix_engagement_rls_for_staff.sql` | Trigger + applications policy for staff. |
| 4 | `20260207130000_start_engagement_rpc.sql` | Creates `start_engagement`. **Required.** |
| 5 | `20260207140000_update_application_status_rpc.sql` | Creates `update_application_status`. **Required.** |

If your prod DB is ahead and some of these are already applied, skip those and run only the missing ones.

### 3.3 If a function is missing after migrations

If the app errors with “could not find the function …”, run the matching file **once** in **SQL Editor**:

| Symptom / feature | File to run (full contents) |
|-------------------|------------------------------|
| Comments not saving / `update_candidate_recruiter_notes` missing | `supabase/migrations/RUN_IF_RPC_MISSING_update_candidate_recruiter_notes.sql` |
| Start engagement fails / `start_engagement` missing | `supabase/migrations/RUN_IF_MISSING_start_engagement.sql` |
| Pipeline move doesn’t persist / `update_application_status` missing | `supabase/migrations/RUN_IF_MISSING_update_application_status.sql` |

### 3.4 RPCs that must exist in prod

| RPC | Purpose |
|-----|--------|
| `update_candidate_recruiter_notes(_candidate_id, _notes)` | Saving comments (pipeline, talent pool, applicant detail, shortlists). |
| `start_engagement(_candidate_id, _job_id)` | Starting engagement from Talent Pool. |
| `update_application_status(_application_id, _status, _candidate_id, _outcome, _recruiter_notes)` | All pipeline moves (RTR, screening, document check, submission, outcome, drag). |

More detail: `docs/PROD-MIGRATION-CHECKLIST.md`.

---

## 4. After deploy: what to do

1. **Deploy frontend on Render**  
   Trigger a deploy from `main` (or let auto-deploy run). No extra env changes needed if already set.

2. **Confirm migrations**  
   - Either run `npx supabase db push` (Option A) or run the migration files in order (Option B).  
   - If you get “function … does not exist”, run the corresponding RUN_IF_MISSING / RUN_IF_RPC_MISSING script from section 3.3.

3. **Smoke-test new behaviour**  
   - **AM → Recruiter:** Log in as AM, switch to Recruiter; confirm URL and pipeline load correctly.  
   - **Comments:** As recruiter or AM, add/edit comments in pipeline, talent pool, or applicant detail; save and reload to confirm they persist.  
   - **Start engagement:** Talent Pool → pick candidate → Start engagement → choose job; confirm candidate appears in pipeline and talent pool stage updates.  
   - **Pipeline moves:** Move a candidate (e.g. to RTR, screening, outcome); confirm status persists and RTR/email flow works if used.  
   - **Manager candidates:** As manager/AM, open **Candidates**; confirm list by job, status labels match pipeline (Engaged, RTR & rate, etc.), filters work, candidate name opens detail drawer, comments column shows.

4. **If something breaks**  
   - Check browser console and network for RPC/auth errors.  
   - In Supabase Dashboard, confirm the three RPCs exist under Database → Functions and that policies/triggers from the migrations are present.

---

## 5. Quick checklist

- [ ] Code committed and pushed to `main`
- [ ] Render deploy triggered (or auto-deploy from `main`)
- [ ] Migrations applied in prod (CLI or SQL Editor)
- [ ] All three RPCs exist in prod (fix with RUN_IF_* SQL if not)
- [ ] Smoke tests: AM/recruiter switch, comments, start engagement, pipeline moves, manager candidates page

After that, you’re ready to test the new functionality in production.
