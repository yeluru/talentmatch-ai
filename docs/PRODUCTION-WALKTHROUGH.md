# Production deployment — step-by-step walkthrough

**How to use this guide:** Do **one step** at a time. Complete everything in the step, then do the **Verify** checklist. Only move to the next step when verification passes. If something fails, fix it (or ask for help) before continuing.

Start with **Step 1** below.

---

## Step 1 — Create or select your Supabase project

**What you’re doing:** Ensuring you have a Supabase project and capturing its URL and keys for later steps.

**Do this:**

1. Open [Supabase Dashboard](https://app.supabase.com) and sign in.
2. Either:
   - Click **New project**, pick organization, name (e.g. `talentmatch-prod`), set a DB password, choose region, then **Create new project**,  
   **or**
   - Open an **existing** project you want to use for production.
3. Wait until the project status is **Active** (green).
4. In the left sidebar go to **Project Settings** (gear) → **API**.
5. Copy and save somewhere safe (e.g. a notes doc):
   - **Project URL** — e.g. `https://abcdefgh.supabase.co`
   - **anon public** key — under "Project API keys", the one labeled **anon** / **public**
   - **Project ref** — the short id in the URL (e.g. from `https://app.supabase.com/project/abcdefgh` the ref is `abcdefgh`)

**Verify:**

- [ ] Project is **Active** in the dashboard.
- [ ] You have written down: **Project URL**, **anon public key**, and **Project ref**.

Reply with: *Step 1 done* (or say what’s blocking you), then continue to Step 2.

---

## Step 2 — Confirm Supabase is reachable

**What you’re doing:** Making sure the project URL and API are working.

**Do this:**

1. In the same Supabase project, open **Table Editor** in the left sidebar.
2. You may see no tables yet (we add them in the next step). That’s fine.

**Verify:**

- [ ] **Table Editor** loads without errors.
- [ ] **Project Settings → API** still shows your Project URL and anon key.

Reply with: *Step 2 done*, then continue to Step 3.

---

## Step 3 — Run database migrations

**What you’re doing:** Creating all tables and RLS policies in your production database.

**Do this:**

1. On your machine, open a terminal and go to your project root (where `package.json` and `supabase/` live).
2. Link the project (use your **Project ref** from Step 1):

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   When prompted, enter your **database password** (the one you set when creating the project).

3. Push migrations:

   ```bash
   npx supabase db push
   ```

4. If you get “no migrations to run”, that’s okay — it means the DB is already up to date. If you get errors, read the message; often it’s wrong password or wrong project ref.

**Verify:**

- [ ] `supabase link` completes and reports success (or “already linked”).
- [ ] `supabase db push` completes without errors.
- [ ] In Supabase dashboard → **Table Editor**, you see tables (e.g. `profiles`, `jobs`, `organizations`).

Reply with: *Step 3 done* (or paste the error), then continue to Step 4.

---

## Step 4 — Get your Resend API key

**What you’re doing:** Getting the key Supabase will use to send invite emails.

**Do this:**

1. Open [Resend](https://resend.com) and sign in.
2. In the dashboard go to **API Keys** (or **Developers → API Keys**).
3. Click **Create API Key**.
4. Give it a name (e.g. `TalentMatch production`), choose permission (e.g. **Sending access**), create.
5. **Copy the key immediately** (it’s shown only once) and store it somewhere safe.

**Verify:**

- [ ] The key starts with `re_` and is long (e.g. `re_123abc...`).
- [ ] You have saved it somewhere you can paste from in the next step.

Reply with: *Step 4 done*, then continue to Step 5.

---

## Step 5 — Set Supabase Edge Function secrets (required ones)

**What you’re doing:** Giving your Edge Functions the Resend key, app URL, and OpenAI key so invites and AI features work.

**Do this:**

1. In Supabase dashboard, open your project.
2. Go to **Edge Functions** in the left sidebar (or **Project Settings → Edge Functions**).
3. Find **Manage secrets** or **Secrets** and open it.
4. Add these secrets one by one (name = key, value = your value):

   | Name | Value |
   |------|--------|
   | `RESEND_API_KEY` | Your Resend API key from Step 4 |
   | `PUBLIC_APP_URL` | Your production URL. **For now** use your Render URL, e.g. `https://talentmatch-ai.onrender.com` (we’ll get the exact URL in a later step; you can change it later) |
   | `APP_URL` | Same as `PUBLIC_APP_URL` |
   | `OPENAI_API_KEY` | Your OpenAI API key (from platform.openai.com) |

   If you don’t have a Render URL yet, use a placeholder like `https://your-app-name.onrender.com` and you’ll update it when the site is created.

5. Save each secret (e.g. **Add secret** or **Save**).

**Verify:**

- [ ] All four secrets appear in the list: `RESEND_API_KEY`, `PUBLIC_APP_URL`, `APP_URL`, `OPENAI_API_KEY`.
- [ ] No typo in the secret **names** (they are case-sensitive).

Reply with: *Step 5 done*, then continue to Step 6.

---

## Step 6 — Deploy Edge Functions

**What you’re doing:** Deploying all Supabase Edge Functions so the app can call them in production.

**Do this:**

1. In your project root in the terminal, run:

   ```bash
   npx supabase functions deploy
   ```

2. If prompted, log in to Supabase CLI (`npx supabase login`).
3. Wait until the command finishes. It will list each function as it deploys.

**Verify:**

- [ ] The command exits with success (no red errors).
- [ ] In Supabase dashboard → **Edge Functions**, you see a list of functions (e.g. `send-recruiter-invite`, `send-org-admin-invite`, `parse-resume`, etc.).

Reply with: *Step 6 done* (or paste the error), then continue to Step 7.

---

## Step 7 — Create the Render Static Site and connect the repo

**What you’re doing:** Creating the frontend service on Render and connecting it to your Git repo.

**Do this:**

1. Open [Render Dashboard](https://dashboard.render.com) and sign in.
2. Click **New +** → **Static Site**.
3. Connect your Git provider (GitHub/GitLab) if not already connected, and select the **repository** that contains this TalentMatch code.
4. Configure:
   - **Name:** e.g. `talentmatch-ai` (this will give you `https://talentmatch-ai.onrender.com`).
   - **Branch:** `main` (or your production branch).
   - **Build Command:** `npm run build` (or `pnpm build` / `bun run build` if you use those).
   - **Publish Directory:** `dist`
   - **Root Directory:** leave blank unless your app lives in a subfolder.
5. **Do not** add environment variables yet — we do that in the next step.
6. Click **Create Static Site**. Render will run the first build.

**Verify:**

- [ ] The new Static Site appears in your Render dashboard.
- [ ] You know the **exact URL** (e.g. `https://talentmatch-ai.onrender.com`). You can copy it from the top of the service page.
- [ ] If the first build fails, open the **Logs** tab and fix the error (often a missing env var); we add env vars in Step 8.

Reply with: *Step 7 done* and your Render URL, then continue to Step 8.

---

## Step 8 — Add environment variables on Render

**What you’re doing:** Letting the frontend build know which Supabase project to use (baked in at build time).

**Do this:**

1. In Render, open your **Static Site** (e.g. `talentmatch-ai`).
2. Go to the **Environment** tab (or **Environment** in the left menu).
3. Add these variables (use the values from Step 1 and your actual Render URL from Step 7):

   | Key | Value |
   |-----|--------|
   | `VITE_SUPABASE_URL` | Your Supabase **Project URL** (e.g. `https://abcdefgh.supabase.co`) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase **anon public** key |
   | `VITE_SUPABASE_PROJECT_ID` | Your Supabase **Project ref** (optional but fine to set) |

4. Save. Render will trigger a **new build** automatically.

**Verify:**

- [ ] All three variables are set (no trailing spaces in key names).
- [ ] A new build has started. Wait for it to finish (green **Live** or **Deploy succeeded**).
- [ ] If the build failed, check **Logs**; fix any missing or wrong env value and redeploy.

Reply with: *Step 8 done*, then continue to Step 9.

---

## Step 9 — Add the SPA rewrite on Render

**What you’re doing:** Making sure every path (e.g. `/recruiter/jobs`) serves the app so React Router works and refreshes don’t 404.

**Do this:**

1. In Render, open your Static Site.
2. Go to **Redirects/Rewrites** (or **Settings** and find Redirects/Rewrites).
3. Add a **Rewrite** rule:
   - **Source Path:** `/*`
   - **Destination Path:** `/index.html`
   - **Action:** **Rewrite** (not Redirect)
4. Save.

**Verify:**

- [ ] The rule is saved and shows **Rewrite** (not Redirect).
- [ ] In the browser, open your Render URL (e.g. `https://talentmatch-ai.onrender.com`). The app loads.
- [ ] Open a deep link (e.g. `https://talentmatch-ai.onrender.com/auth`) and refresh the page. You should still see the app (not a 404).

Reply with: *Step 9 done*, then continue to Step 10.

---

## Step 10 — Set Supabase Auth URL and redirect URLs

**What you’re doing:** Telling Supabase where your app lives so sign-in and invite links redirect correctly.

**Do this:**

1. In Supabase dashboard, open your project.
2. Go to **Authentication** → **URL Configuration** (or **Auth → URL Configuration**).
3. Set:
   - **Site URL:** Your Render URL, e.g. `https://talentmatch-ai.onrender.com` (no trailing slash).
   - **Redirect URLs:** Add these two (one per line or comma-separated, depending on UI):
     - `https://talentmatch-ai.onrender.com/**`
     - Your exact Render URL: `https://talentmatch-ai.onrender.com`
4. Save.

**Verify:**

- [ ] **Site URL** is exactly your production URL, no trailing slash.
- [ ] **Redirect URLs** include `https://your-site.onrender.com/**` and the base URL.
- [ ] In the app in the browser, open your Render URL → go to sign-in/sign-up. After signing in, you are redirected back to the app (no redirect error from Supabase).

Reply with: *Step 10 done*, then continue to Step 11.

---

## Step 11 — Update app URL in Supabase if needed

**What you’re doing:** If you used a placeholder in Step 5 for `PUBLIC_APP_URL` and `APP_URL`, set them to your real Render URL now.

**Do this:**

1. In Supabase → **Edge Functions** → **Manage secrets**.
2. If `PUBLIC_APP_URL` or `APP_URL` was a placeholder, update both to your **exact Render URL** (e.g. `https://talentmatch-ai.onrender.com`), no trailing slash.
3. Save. (No need to redeploy Edge Functions; they read secrets at runtime.)

**Verify:**

- [ ] Both `PUBLIC_APP_URL` and `APP_URL` match your live Render URL.
- [ ] Optional: trigger an invite from the app and check the email; the link in the email should point to your Render URL.

Reply with: *Step 11 done*, then continue to Step 12.

---

## Step 12 — Resend: verify sending domain (for production email)

**What you’re doing:** So invite emails come “from” your domain and are less likely to be filtered (optional but recommended for production).

**Do this:**

1. In [Resend](https://resend.com) go to **Domains**.
2. Click **Add Domain** and enter your domain (e.g. `yourdomain.com` or `mail.yourdomain.com`).
3. Resend will show DNS records (MX, DKIM, etc.). Add those records at your **domain registrar / DNS provider** (where you manage DNS for your domain).
4. In Resend, click **Verify** (or wait for automatic verification). Status should become **Verified**.

**Verify:**

- [ ] Domain status in Resend is **Verified**.
- [ ] Send a test invite from your app; the invite email is received and the “from” address uses your domain (if you configured it in invite templates).

If you skip domain verification, invites can still send from Resend’s default domain; you can add and verify your domain later.

Reply with: *Step 12 done* (or *Skipped for now*), then continue to Step 13.

---

## Step 13 — (Optional) Add custom domain on Render

**What you’re doing:** Serving the app from your own domain (e.g. `app.yourdomain.com`).

**Do this:**

1. In Render, open your Static Site → **Settings** → **Custom Domains**.
2. Click **Add custom domain** and enter the domain (e.g. `app.yourdomain.com`).
3. Render will show which DNS record to add (usually a **CNAME** pointing to your Render hostname, e.g. `talentmatch-ai.onrender.com`).
4. At your DNS provider, add that CNAME record.
5. Back in Render, wait until the domain shows as **Verified** and SSL is active.

**Verify:**

- [ ] Custom domain is **Verified** in Render.
- [ ] Visiting `https://app.yourdomain.com` (or your chosen hostname) loads the app over HTTPS.

**Then:** In Supabase **Edge Function secrets**, set `PUBLIC_APP_URL` and `APP_URL` to your **custom URL** (e.g. `https://app.yourdomain.com`). In Supabase **Authentication → URL configuration**, set **Site URL** and add your custom domain to **Redirect URLs**.

Reply with: *Step 13 done* or *Skipped*, then continue to Step 14.

---

## Step 14 — Final verification checklist

**What you’re doing:** Confirming the main flows work in production.

**Do this:**

Go through this list and tick each item:

- [ ] **App loads:** Opening your production URL (Render or custom domain) shows the TalentMatch app.
- [ ] **Sign up / Sign in:** You can create an account and sign in; redirect back to the app works.
- [ ] **Deep links:** Navigating to e.g. `/recruiter/jobs` and refreshing does not 404.
- [ ] **Invite flow:** From the app, send an invite (org admin, manager, or recruiter). The email arrives and the link opens your production app.
- [ ] **Engagement email (if used):** If you use engagement emails, send one and confirm the “Review & respond” link opens the app.

**Verify:**

- [ ] All items above that apply to you are checked.
- [ ] If something fails, note which step and which check; use the **Troubleshooting** section in `PRODUCTION-DEPLOYMENT.md` or fix the specific step.

Reply with: *Step 14 done — production verified* (or list what’s still failing).

---

You’re done. For optional extras (SMTP for engagement emails, more Edge Function secrets for Talent Sourcing, etc.), see **PRODUCTION-DEPLOYMENT.md**.
