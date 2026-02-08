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

### 3.1 Option A: Supabase CLI — link to prod, then push

`npx supabase db push` applies migrations to **whichever project is currently linked**, not to “local” or “prod” by default. So you need to **link this repo to your production project** before pushing to prod.

**Get your production project ref**

- In [Supabase Dashboard](https://app.supabase.com), open your **production** project.
- Go to **Settings → General**.
- Copy **Reference ID** (e.g. `abcdefghijklmnop`). Or use the project ref from the URL: `https://app.supabase.com/project/<project-ref>`.

**Link to production and push**

From repo root:

```bash
# Log in if you haven’t (uses browser or token)
npx supabase login

# Link this repo to your production project (use your prod Reference ID)
npx supabase link --project-ref <YOUR_PROD_PROJECT_REF>

# Push pending migrations to the linked (prod) project
npx supabase db push
```

After `link`, the CLI stores the linked project in `.supabase/` (typically gitignored). So:

- **Local dev:** If you use `supabase start`, that’s a local Postgres; migrations you apply there are local only. To push those same migrations to prod, you run `link --project-ref <prod-ref>` once, then `db push` whenever you want to update prod.
- **Switching projects:** To push to a different project later, run `supabase link --project-ref <other-ref>` again; then `db push` targets that project.

**Check which project is linked**

```bash
npx supabase projects list
npx supabase status   # shows linked project when run in repo
```

**Summary:** Use the production project’s Reference ID with `supabase link --project-ref <prod-ref>`, then run `npx supabase db push` to apply migrations to prod.

**Note:** `supabase/config.toml` has a `project_id`; that is used by **local** Supabase (`supabase start`), not by `db push`. Where `db push` goes is determined only by **the project you linked** with `supabase link --project-ref`.

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

## 4. Deploy Edge Functions to production

**`supabase db push` does not deploy Edge Functions.** If your app calls any function (e.g. `get-my-auth-data` for login), you must deploy it to the linked project:

```bash
# Deploy the auth bootstrap function (required for login)
npx supabase functions deploy get-my-auth-data

# Or deploy all functions
npx supabase functions deploy
```

Without this, the production site gets CORS or "Failed to send request to Edge Function" because the function doesn’t exist on the project and the gateway returns a non-2xx response without CORS headers.

---

## 5. After deploy: what to do

1. **Deploy frontend on Render**  
   Trigger a deploy from `main` (or let auto-deploy run). No extra env changes needed if already set.

2. **Deploy Edge Functions**  
   Run `npx supabase functions deploy get-my-auth-data` (and any other functions the app uses). See section 4.

3. **Confirm migrations**  
   - Either run `npx supabase db push` (Option A) or run the migration files in order (Option B).  
   - If you get “function … does not exist”, run the corresponding RUN_IF_MISSING / RUN_IF_RPC_MISSING script from section 3.3.

4. **Smoke-test new behaviour**  
   - **AM → Recruiter:** Log in as AM, switch to Recruiter; confirm URL and pipeline load correctly.  
   - **Comments:** As recruiter or AM, add/edit comments in pipeline, talent pool, or applicant detail; save and reload to confirm they persist.  
   - **Start engagement:** Talent Pool → pick candidate → Start engagement → choose job; confirm candidate appears in pipeline and talent pool stage updates.  
   - **Pipeline moves:** Move a candidate (e.g. to RTR, screening, outcome); confirm status persists and RTR/email flow works if used.  
   - **Manager candidates:** As manager/AM, open **Candidates**; confirm list by job, status labels match pipeline (Engaged, RTR & rate, etc.), filters work, candidate name opens detail drawer, comments column shows.

5. **If something breaks**  
   - Check browser console and network for RPC/auth errors.  
   - In Supabase Dashboard, confirm the three RPCs exist under Database → Functions and that policies/triggers from the migrations are present.

---

## 6. Assigning roles in production (“No role has been assigned”)

If a user signs in successfully but sees **“Your account is active, but no role has been assigned yet”**, the app is working; that user has no row in `public.user_roles` in production.

**Option A — Platform admin (super_admin)**  
Add their email to the allowlist so the next sign-in auto-assigns the role:

1. In **Supabase Dashboard** → your **production** project → **Table Editor**.
2. Open table **`platform_admin_allowlist`**.
3. **Insert row:** set `email` to the user’s email (e.g. `admin@yourcompany.com`).
4. User signs out and signs in again; `handle_new_user` does not run again, but **`bootstrap-platform-admin`** Edge Function runs on sign-in and grants `super_admin` if the email is in the allowlist.  
   - If the user was created before the allowlist existed, they already have a profile; the **bootstrap-platform-admin** function (called during sign-in) checks the allowlist and inserts into `user_roles`. So adding the email and having them sign in again is enough.

**Option B — Assign any role manually (SQL)**  
In **Supabase Dashboard → SQL Editor** (production project), run:

```sql
-- Replace with the user's email and desired role
INSERT INTO public.user_roles (user_id, role, organization_id)
SELECT id, 'super_admin', NULL FROM auth.users WHERE email = 'admin@yourcompany.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

For `recruiter` or `account_manager` or `org_admin`, you need an `organization_id` (from `public.organizations`). Example:

```sql
-- Get an org id first: SELECT id, name FROM public.organizations;
INSERT INTO public.user_roles (user_id, role, organization_id)
SELECT u.id, 'org_admin', '<org-uuid>' FROM auth.users u WHERE u.email = 'admin@yourcompany.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

**If the message is “We couldn’t load your permissions…”**  
That means the **get-my-auth-data** Edge Function failed (e.g. 401/500). Ensure:

1. **Edge Functions are deployed** for the production project: `npx supabase functions deploy get-my-auth-data` (and `bootstrap-platform-admin` if you use it).
2. The **frontend** uses the **same** Supabase project (same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as the project where you deployed the functions).
3. In the browser **Network** tab, check the response of the `get-my-auth-data` request (status and body) to see the actual error.

---

## 7. Quick checklist

- [ ] Code committed and pushed to `main`
- [ ] **Edge Functions deployed to prod** (`npx supabase functions deploy get-my-auth-data` or `supabase functions deploy`)
- [ ] Render deploy triggered (or auto-deploy from `main`)
- [ ] Migrations applied in prod (CLI or SQL Editor)
- [ ] All three RPCs exist in prod (fix with RUN_IF_* SQL if not)
- [ ] Smoke tests: login, AM/recruiter switch, comments, start engagement, pipeline moves, manager candidates page

After that, you’re ready to test the new functionality in production. If users see "no role assigned", see **Section 6**.
