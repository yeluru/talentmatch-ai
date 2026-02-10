# Local development notes (Supabase)

## Which option am I using? (Option A vs B)

**You are on Option A** if you run **both** of these and keep them running:

1. **Terminal 1:** `supabase start` — starts DB, Auth, Kong (API at 54321).
2. **Terminal 2:** `supabase functions serve --env-file supabase/functions.env` — runs Edge Functions **on your machine** with your env (CloudConvert, Resend, etc.).

When both are running, function requests to `http://127.0.0.1:54321/functions/v1/...` are served by the process in Terminal 2 (Option A), so your secrets and DOCX path are used. You do **not** need to set `VITE_SUPABASE_FUNCTIONS_DIRECT_URL` in this setup.

**You are on Option B** if you only run `supabase start` and never run `supabase functions serve`. Then requests go to the **Docker** edge-runtime, which only gets env from `supabase/functions/.env` (and that file is not always loaded). RTR would then only fill the rate unless you add secrets to that `.env` and restart.

**Recommendation:** Use **Option A**: run `supabase functions serve --env-file supabase/functions.env` in a second terminal so RTR gets the DOCX template and CloudConvert. Run it from the **project root** (e.g. `cd /Users/raviyeluru/ultrahire/talentmatch-ai` then the command above).

---

## Status: production vs local

| What | Status |
|------|--------|
| **Production (Supabase cloud)** | Unlinked. No `db push` or `functions deploy` from this machine will touch prod until you run `supabase link` again. Prod DB and data are unchanged. |
| **Local (this machine)** | You run `supabase start` here. The app on localhost talks to **local** Supabase only (see `src/integrations/supabase/client.ts`). |

## Step-by-step: get localhost up to date

1. **Free ports if `supabase start` fails with "port already allocated"**  
   Another Supabase project (e.g. `talentmatch-ai`, from when `project_id` was unset) may still be running. Stop it by project id:
   ```bash
   supabase stop --project-id talentmatch-ai
   ```
   Then run `supabase start` again. If the message names a different project id, use that in `supabase stop --project-id <that-id>`.  
   Alternatively, in `supabase/config.toml` you can use a different `[db] port` (e.g. 54332 is already set in this repo to avoid 54322).

2. **Start local Supabase**  
   From the project root:
   ```bash
   supabase start
   ```
   Wait until it prints "Started supabase local development setup" and the URLs (API, Studio, etc.).

3. **Open Studio (optional)**  
   http://localhost:54323 — use the SQL Editor here to run any **new** migration files from `supabase/migrations/` if you want to apply them without `db reset`. Your existing local data and Auth users stay.

4. **Start Edge Functions (required for login, RTR, emails, invite links, etc.)**  
   Requests to `http://127.0.0.1:54321/functions/v1/*` go to a functions server. If you get **404** or **503**, the app can't reach your functions.

   **Option A (recommended):** Start Supabase **without** the built-in edge-runtime, then run the functions server on your machine so it gets your `.env.local` and stays in sync with Kong:
   ```bash
   supabase start --exclude edge-runtime
   ```
   Then in a **second terminal**, from the project root:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```
   Leave that running. Kong will proxy to this process.

   **Option B:** If you already ran `supabase start` (with edge-runtime), run in a second terminal:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```
   If you still get 503, use Option A (restart with `--exclude edge-runtime` then run `functions serve`).

   **If 503 persists:** Kong may be proxying to the Docker edge-runtime instead of your host `functions serve` process. Use the **direct-URL bypass** so the app calls the functions server on your machine directly:

   1. In the terminal where you run `supabase functions serve`, note the port (often **8081**). If it says e.g. "Serving functions on http://127.0.0.1:8081", use that.
   2. In the project root, create or edit **`.env`** (or `.env.local`) and set:
      ```
      VITE_SUPABASE_FUNCTIONS_DIRECT_URL=http://127.0.0.1:8081
      ```
      (Use the port your `functions serve` actually shows.)
   3. Restart the Vite dev server (`npm run dev`) so it picks up the env var.
   4. Trigger RTR again; the app will call `http://127.0.0.1:8081/send-rtr-email` instead of going through Kong.

   Alternatively, ensure the Docker edge-runtime has env: create **`supabase/functions/.env`** with at least `RESEND_API_KEY` and `RESEND_FROM`, and from `supabase status -o env` add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` if the function logs "Edge function env missing".

   With `--env-file supabase/.env.local`, the RTR function can find `RTR_TEMPLATE_PATH`. To **actually send emails** locally, see the Email section below (Mailpit or Resend).

5. **Run the app**  
   From the project root (first or third terminal):
   ```bash
   npm run dev
   ```
   Open http://localhost:8080 (or the port Vite shows). The app will use **local** Supabase (API at http://127.0.0.1:54321) automatically when the host is localhost.

6. **When you’re done**  
   `supabase stop` to shut down local Supabase and free the ports.

**To sign in locally:** Use a user that exists in **local** Auth only. Create one in Studio (http://localhost:54323 → **Authentication** → **Users** → **Add user**, then add role/profile via SQL—see "Recovery after a local reset") or use **Sign up** in the app. Production users do not exist in local.

## Staying unlinked from production

To avoid accidentally pushing migrations or deploying functions to **production** while you test locally:

- **`supabase/config.toml`** has `project_id` set so local Docker volumes are reused (same DB across restarts). To avoid pushing to prod, run **`supabase unlink`** after start (or never run `supabase link`). Then **`supabase db push`** and **`supabase functions deploy`** will not target a remote project until you link again.

**Why did my local data disappear?** The CLI uses `project_id` (or the directory name if unset) to name Docker volumes. If `project_id` was commented out after you had already run `supabase start` with it set, the next `supabase start` can use a **different** set of volumes (e.g. keyed by directory name), which are new and empty. So you didn't run `db reset`, but you effectively got a fresh DB. To avoid that in future, keep `project_id` in config so the same volumes are reused; or accept that changing it can switch to a new (empty) data set.

**To link to prod again when you’re ready:**

1. In `supabase/config.toml`, uncomment the `project_id = "..."` line (or run `npx supabase link --project-ref YOUR_PROJECT_REF` and let the CLI set it).
2. Run migrations or deploy functions as needed.

**Optional:** You can also run `npx supabase unlink` in the project root to remove the link via the CLI (if your CLI version supports it). The commented `project_id` in config achieves the same safety.

## Email (RTR, submission, screening invite, engagement)

Edge functions send email either via **Resend** (HTTP API) or **SMTP**. To test that emails are sent before pushing:

- **Option A – Mailpit (recommended for local testing)**  
  Emails are delivered to a local inbox you can open in the browser (subject, body, attachments).

  1. Start Mailpit (one-off or when you need it):
     ```bash
     docker run -d -p 1025:1025 -p 8025:8025 --name mailpit axllent/mailpit
     ```
  2. In `supabase/.env.local`, **do not set** `SKIP_SMTP_DEV`, or set it to `false`. The function defaults to `127.0.0.1:1025` (Mailpit).
  3. Run `supabase functions serve --env-file supabase/.env.local` as in step 4 above.
  4. Send an RTR (or other email) from the app; open **http://localhost:8025** to see the email.

- **Option B – Resend (real inbox)**  
  Emails are sent through Resend to the actual "To" address (e.g. your own email).

  1. In `supabase/.env.local`, set:
     ```
     RESEND_API_KEY=re_xxxxxxxxxxxx
     RESEND_FROM=Your Name <onboarding@resend.dev>
     ```
     (Use a [Resend](https://resend.com) API key; `onboarding@resend.dev` works for testing. For your own domain, add and verify it in Resend and set `RESEND_FROM` to that address.)
  2. Run `supabase functions serve --env-file supabase/.env.local`. The function uses the Resend API and skips SMTP.
  3. Send an RTR to your real email to confirm delivery and content.

- **Option C – Skip sending in dev**  
  If you don't need to see the email (e.g. only testing the pipeline step), set in `supabase/.env.local`:
  ```
  SKIP_SMTP_DEV=true
  ```
  When SMTP would fail (e.g. Mailpit not running), the function returns success and the candidate still moves to the next stage.

**RTR (Right to Represent) – DOCX to PDF**  
  The RTR flow merges popup form values into a Word template and converts to PDF. **Same solution on local and prod:** set **CLOUDCONVERT_API_KEY** (from [cloudconvert.com](https://cloudconvert.com)); CloudConvert is ISO 27001 certified, GDPR compliant, and deletes files after processing ([security](https://cloudconvert.com/security)). Alternatively you can use local LibreOffice (no third party) or your own conversion service.

  **Option A – CloudConvert (same on local and prod)**  
  Set `CLOUDCONVERT_API_KEY` in `supabase/functions.env` (local) and in Edge Function secrets (prod). Set `RTR_TEMPLATE_DOCX_URL` in prod (URL to your template) and `RTR_TEMPLATE_DOCX_PATH=docs/CompSciPrep_RTR_Template.docx` locally.

  **Option B – Local LibreOffice only**  
  1. Install LibreOffice so the `soffice` command is on your PATH:
     - **macOS:** `brew install --cask libreoffice`
     - **Windows:** install from [libreoffice.org](https://www.libreoffice.org/download/download/)
     - **Linux:** `sudo apt install libreoffice` (or your distro’s package).
  2. In `supabase/functions.env` (or `--env-file`), set:
     ```
     RTR_TEMPLATE_DOCX_PATH=docs/CompSciPrep_RTR_Template.docx
     ```
     (Path is relative to the directory from which you run `supabase functions serve`, usually the project root.)
  3. Restart `supabase functions serve`. When you send an RTR, the function will load the DOCX, merge fields, run `soffice --headless --convert-to pdf`, and attach the PDF. If `soffice` is not found, you’ll get an error asking you to install LibreOffice or set `LIBREOFFICE_PATH`.

  **Production:** Supabase Edge Functions (cloud) cannot run LibreOffice. For production RTR with full merge you’ll need either a self-hosted worker that has LibreOffice and is called by your app, or host the Edge Function in an environment where you can run `soffice`. Instead, set **RTR_CONVERSION_SERVICE_URL** to your own API that runs LibreOffice (POST /convert with `{ "docx_base64": "..." }`, returns PDF or `{ "pdf_base64": "..." }`), or set CLOUDCONVERT_API_KEY to fall back to CloudConvert.

  **RTR – Step-by-step test (CloudConvert)**  
  1. Create an API key at [cloudconvert.com](https://cloudconvert.com) (dashboard → API).  
  2. Open `supabase/functions.env`. Set `CLOUDCONVERT_API_KEY=<your_key>`. Ensure `RTR_TEMPLATE_DOCX_PATH=docs/CompSciPrep_RTR_Template.docx` is set.  
  3. From project root: `supabase start` (if not running), then in another terminal: `supabase functions serve --env-file supabase/functions.env`.  
  4. **Important:** Requests to `http://127.0.0.1:54321` go to Kong → Docker; the container does **not** get your `functions.env`, so RTR would only fill the rate. Set **VITE_SUPABASE_FUNCTIONS_DIRECT_URL=http://127.0.0.1:8081** in project-root **.env.local** (see that file) so the app calls the host’s `functions serve` (which has your env). Restart the app after changing `.env.local`. If 8081 fails (connection refused), check the `functions serve` terminal for the port it’s listening on and use that.  
  5. In the app: recruiter pipeline → open a candidate → send RTR. Fill all RTR form fields and rate, then **Send RTR & move to RTR & rate**.  
  6. Check email (or Mailpit at http://localhost:8025). The attachment should be a PDF with all popup values filled (bold); only candidate-only fields are fillable boxes. Response will take a few seconds (CloudConvert); if it’s instant, the request is still going to Docker (no env) — use the direct URL in step 4.

## Troubleshooting

- **503 on `send-rtr-email` or other Edge Functions** — **Steps to run now:**

  1. In a terminal (from project root), start the functions server and leave it running:
     ```bash
     supabase functions serve --env-file supabase/functions.env
     ```
     Note the port in the output (e.g. `Serving functions on http://127.0.0.1:8081` → use **8081**).

  2. In the project root, create or edit **`.env`** or **`.env.local`** and add (use the port from step 1):
     ```
     VITE_SUPABASE_FUNCTIONS_DIRECT_URL=http://127.0.0.1:8081
     ```

  3. Restart the Vite dev server (stop `npm run dev`, then run `npm run dev` again).

  4. Trigger RTR again; the app will call the functions server directly and bypass Kong.

- **404 or 503 on `/functions/v1/...` (general)**  
  Run `supabase functions serve --env-file supabase/functions.env` (or `supabase/.env.local`) in a second terminal. If 503 persists, use the direct-URL bypass steps above.

- **401 from `get-my-auth-data` or "Invalid login credentials"**  
  Often caused by a **stale session** (e.g. you were signed in to production and the app is now pointed at local). The app will clear the session on 401 so you see the login screen again. Sign in with a user that exists in **local** Auth:
  - Create a user in Studio: http://localhost:54323 → **Authentication** → **Users** → **Add user** (then add a role and profile as in "Recovery after a local reset" below), or
  - Use **Sign up** in the app to create a new local user.

## Important: `supabase db reset` is destructive

Running `supabase db reset` **recreates the local Postgres database** and will wipe local data, including **local Auth users**.

Symptoms after a reset:
- You can’t sign in with old credentials (`Invalid email or password`)
- Previously imported candidates / resumes disappear (local-only data loss)

## Applying a one-off data fix locally (safe)

If you only need to run a backfill/patch (like the `candidate_org_links` backfill), **do not reset**.

Use local Supabase Studio:
- Open `http://localhost:54323`
- Go to **SQL Editor**
- Paste and run the SQL from the migration file you want to apply.

This keeps your local Auth users + data intact.

## Applying schema migrations locally (tradeoffs)

Depending on Supabase CLI version, the CLI may not support a non-destructive “apply migrations to local” command.
If your CLI only supports `supabase db reset` for local migration application, then:
- **Use Studio SQL Editor** for small changes/backfills (preferred)
- Only use `supabase db reset` when you are okay losing local data/users

## Recovery after a local reset (fast)

1) Recreate the Auth user in local Studio:
- `http://localhost:54323` → **Authentication → Users → Add user**
- Create user + mark confirmed
- Copy the `user_id` (UUID)

2) Create an org + assign recruiter role:

```sql
insert into public.organizations (name)
values ('Local Test Org')
returning id;
```

Then:

```sql
insert into public.user_roles (user_id, role, organization_id)
values ('<AUTH_USER_ID>', 'recruiter', '<ORG_ID>');
```

3) (Optional) Ensure a profile row exists:

```sql
insert into public.profiles (user_id, email, full_name)
values ('<AUTH_USER_ID>', '<EMAIL>', '<FULL_NAME>')
on conflict (user_id) do update
set email = excluded.email, full_name = excluded.full_name;
```

