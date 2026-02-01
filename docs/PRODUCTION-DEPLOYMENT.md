# Production Deployment Guide

This guide walks you through deploying **UltraHire** (formerly TalentMatch AI) to production using:

- **Render** — host the Vite React frontend (static site or web service)
- **Supabase** — Auth, PostgreSQL, Storage, Edge Functions (already cloud-hosted)
- **Resend** — transactional email for invites (org admin, manager, recruiter)
- **Your domain** — custom domain on Render + Supabase

---

## Prerequisites

- [x] Render account
- [x] Registered domain
- [x] Resend account
- Supabase project (create one at [supabase.com](https://supabase.com) if needed)
- Git repo with this code pushed (e.g. GitHub/GitLab) for Render auto-deploys

---

## 1. Supabase (Backend)

### 1.1 Create or use an existing project

1. Go to [Supabase Dashboard](https://app.supabase.com) → **New project** (or use existing).
2. Note:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`) → you’ll use this as `VITE_SUPABASE_URL`
   - **anon public** key (Project Settings → API) → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Project ref** (from URL or Settings) → optional for `VITE_SUPABASE_PROJECT_ID`

### 1.2 Run migrations

From the repo root:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or apply migrations manually in **SQL Editor** in the Supabase dashboard (run each file in `supabase/migrations/` in order).

### 1.3 Edge Function secrets (Supabase Dashboard)

In **Project → Edge Functions → Manage secrets** (or **Settings → Edge Functions**), set:

| Secret | Description | Required for |
|--------|-------------|--------------|
| `RESEND_API_KEY` | Resend API key (from Resend dashboard) | Invite emails (org admin, manager, recruiter) |
| `PUBLIC_APP_URL` | Production app URL, e.g. `https://yourdomain.com` | Invite links in emails |
| `APP_URL` | Same as `PUBLIC_APP_URL` | Engagement email “Review & respond” links |
| `OPENAI_API_KEY` | OpenAI API key | Resume/job parsing, AI matching, etc. |
| `OPENAI_MODEL` | (optional) e.g. `gpt-4o-mini` | AI model override |
| `FIRECRAWL_API_KEY` | Firecrawl API key | Talent Sourcing → Web Search / LinkedIn |
| `GOOGLE_CSE_API_KEY` | Google Custom Search API key | Talent Sourcing → Google X-Ray |
| `GOOGLE_CSE_CX` | Google Custom Search engine ID | Talent Sourcing → Google X-Ray |
| `SERPAPI_API_KEY` | SerpAPI key | Talent Sourcing → Serp Search |
| `SMTP_HOST` | SMTP server hostname | Engagement emails (e.g. Resend SMTP) |
| `SMTP_PORT` | SMTP port (e.g. 465 or 587) | Engagement emails |
| `SMTP_USER` | SMTP username (if required) | Engagement emails |
| `SMTP_PASS` | SMTP password | Engagement emails |
| `SMTP_TLS` | `true` for TLS | Engagement emails |
| `SMTP_FROM` | From address, e.g. `TalentMatch <no-reply@yourdomain.com>` | Engagement emails |

**Note:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are set automatically by Supabase for Edge Functions; you do not need to add them.

### 1.4 Deploy Edge Functions

From repo root:

```bash
npx supabase functions deploy
```

Or deploy individually, e.g.:

```bash
npx supabase functions deploy send-recruiter-invite
npx supabase functions deploy send-org-admin-invite
npx supabase functions deploy send-manager-invite
npx supabase functions deploy send-engagement-email
# ... etc.
```

### 1.5 Auth settings (optional but recommended)

- **Authentication → URL configuration**
  - **Site URL:** `https://yourdomain.com` (or your Render URL until custom domain is set)
  - **Redirect URLs:** Add `https://yourdomain.com/**` and your Render default URL
- **Email templates:** Customize “Confirm signup” and “Invite user” if desired; invite links use `PUBLIC_APP_URL`.

---

## 2. Resend (Email)

### 2.1 Get API key

1. [Resend Dashboard](https://resend.com) → **API Keys** → Create API Key.
2. Copy the key and set it in Supabase Edge Function secrets as `RESEND_API_KEY`.

### 2.2 Verify sending domain

1. In Resend: **Domains** → Add domain (e.g. `yourdomain.com`).
2. Add the DNS records Resend provides (MX, DKIM, etc.) at your DNS provider.
3. Use a from-address on that domain (e.g. `no-reply@yourdomain.com`) in invite emails and in `SMTP_FROM` if you use Resend for SMTP.

### 2.3 Optional: Resend SMTP for engagement emails

The app sends **invites** via Resend API (Edge Functions) and **engagement emails** via SMTP. You can use Resend’s SMTP for both:

- Resend → **SMTP** → create SMTP credentials.
- In Supabase Edge Function secrets set:
  - `SMTP_HOST=smtp.resend.com`
  - `SMTP_PORT=465` (or 587)
  - `SMTP_USER=resend`
  - `SMTP_PASS=<your Resend API key>`
  - `SMTP_TLS=true`
  - `SMTP_FROM=TalentMatch <no-reply@yourdomain.com>`

---

## 3. Render (Frontend)

### 3.1 Create a Web Service or Static Site

**Option A — Static Site (recommended for Vite SPA)**

1. Render Dashboard → **New** → **Static Site**.
2. Connect your Git repo (GitHub/GitLab).
3. Configure:
   - **Name:** e.g. `talentmatch-ai`
   - **Branch:** `main` (or your production branch)
   - **Build Command:** `npm run build` (or `pnpm build` / `bun run build`)
   - **Publish Directory:** `dist`
   - **Root Directory:** leave blank if repo root contains `package.json`

**Option B — Web Service (Node server serving static files)**

If you prefer a Node server (e.g. for future API routes or stricter redirects):

1. **New** → **Web Service**.
2. Connect repo, branch, and set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** e.g. `npx serve -s dist -l 10000` (install `serve` in dependencies or use a small Express/Node server that serves `dist` and SPA fallback).

For a plain SPA, **Option A (Static Site)** is simpler.

### 3.2 Environment variables (Render)

In your Render service → **Environment**:

| Key | Value | Notes |
|-----|--------|--------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | e.g. `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | From Supabase → Settings → API |
| `VITE_SUPABASE_PROJECT_ID` | (optional) Project ref | For consistency with env.example |

**Important:** Any variable that must be available in the browser must be prefixed with `VITE_` so Vite inlines it at build time. Do **not** put secrets (e.g. Resend API key) here; those stay in Supabase Edge Function secrets.

### 3.3 Custom domain on Render

1. Render service → **Settings** → **Custom Domains** → **Add custom domain**.
2. Enter your domain (e.g. `app.yourdomain.com` or `yourdomain.com`).
3. Render will show a CNAME (for subdomain) or A record (for apex). Add the corresponding record at your DNS provider.
4. Wait for SSL to be issued (Render provides HTTPS automatically).

### 3.4 SPA redirect (Static Site)

For client-side routing (React Router), all paths must serve `index.html`. On Render:

1. Open your **Static Site** → **Redirects/Rewrites** tab.
2. Add a **Rewrite** rule:
   - **Source Path:** `/*`
   - **Destination Path:** `/index.html`
   - **Action:** Rewrite (not Redirect)

This serves `index.html` for any path so React Router can handle routes. A redirect would change the URL; a rewrite keeps it and serves the SPA.

---

## 4. DNS (Domain)

At your domain registrar or DNS provider:

1. **For Render (e.g. subdomain):**
   - Type: **CNAME**
   - Name: `app` (or `www`, or whatever subdomain you use)
   - Value: the Render hostname (e.g. `talentmatch-ai.onrender.com`)

2. **For apex domain (`yourdomain.com`):** Follow Render’s instructions (often A record to Render’s IP or CNAME flattening if supported).

3. **For Resend:** Add the MX and DKIM records Resend gives you for the domain you want to send from.

---

## 5. Post-deploy checklist

- [ ] **Supabase:** Migrations applied, Edge Functions deployed, secrets set (`RESEND_API_KEY`, `PUBLIC_APP_URL`, `APP_URL`, `OPENAI_API_KEY`, SMTP vars if used).
- [ ] **Resend:** Domain verified; invite emails send successfully (test by inviting a user).
- [ ] **Render:** Build succeeds; env vars set; app loads at Render URL and at custom domain.
- [ ] **Auth:** Sign up / sign in and redirects work; invite flow opens app at `PUBLIC_APP_URL` and completes.
- [ ] **Engagement emails:** If you use `send-engagement-email`, send a test and confirm “Review & respond” links use `APP_URL` and work.

---

## 5b. Deploying updates (Render + Supabase)

After code changes (e.g. branding, UI, or Edge Function logic), deploy both so production stays in sync. **No config or env changes are needed** unless you changed env vars.

### Render (frontend)

1. **Commit and push** your changes to the branch Render uses (e.g. `main`):
   ```bash
   git add -A
   git commit -m "Your message"
   git push origin main
   ```
2. If **Auto-Deploy** is on, Render will build and deploy automatically. Check **Render Dashboard** → your Static Site → **Events** / **Deploys**.
3. If Auto-Deploy is off, open your Static Site → **Manual Deploy** → **Deploy latest commit** (or **Clear build cache & Deploy** if you changed env vars).
4. Wait until the deploy shows **Live**. Your site (e.g. https://ultra-hire.com) will serve the new build.

### Supabase (Edge Functions)

1. From your **project root** (where `supabase/` lives):
   ```bash
   npx supabase functions deploy
   ```
   Or deploy only the functions you changed, e.g.:
   ```bash
   npx supabase functions deploy send-org-admin-invite
   npx supabase functions deploy send-recruiter-invite
   npx supabase functions deploy send-manager-invite
   npx supabase functions deploy send-engagement-email
   ```
2. Wait until the CLI reports success. No need to change **Secrets** unless you changed env var names or values.
3. Invite and engagement emails will use the new function code on the next send.

### Order

- Deploy **Render** and **Supabase** in any order; they are independent. For a branding-only change (e.g. TalentMatch → UltraHire), deploy both so the browser and emails both show UltraHire.

---

## 6. Optional: `render.yaml` (Blueprint)

You can define the static site in a `render.yaml` in the repo root so deployments are reproducible:

```yaml
# render.yaml (optional)
services:
  - type: web
    name: talentmatch-ai
    env: static
    buildCommand: npm run build
    staticPublishPath: dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

Use **Static Site** type if Render supports it in the dashboard and in the blueprint; adjust `type` and `staticPublishPath` to match Render’s current schema.

---

## 7. Summary of URLs and env vars

| Where | What |
|-------|------|
| **Browser (Vite)** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (optional) — set in Render env |
| **Supabase Edge Functions** | `RESEND_API_KEY`, `PUBLIC_APP_URL`, `APP_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `FIRECRAWL_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `SERPAPI_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_TLS`, `SMTP_FROM` — set in Supabase → Edge Functions → Secrets |

Keep `PUBLIC_APP_URL` and `APP_URL` in sync with your production frontend URL (e.g. `https://yourdomain.com`).

---

## 8. Troubleshooting

- **Invite emails not sent:** Ensure `RESEND_API_KEY` is set in Supabase and Resend domain is verified; check Edge Function logs.
- **Invite links point to wrong URL:** Set `PUBLIC_APP_URL` in Supabase secrets to your production URL (no trailing slash).
- **Engagement email “Review & respond” broken:** Set `APP_URL` in Supabase secrets to the same production URL.
- **CORS errors:** Supabase project URL is in **Authentication → URL configuration** and redirect URLs include your production origin.
- **Blank page or 404 on refresh:** Configure SPA fallback on Render so `/*` serves `index.html`.

If you hit a specific error (e.g. build failure or invite not sending), share the message and which step you’re on for targeted help.


Project URL: https://szmuvnnawnfclcusfxbs.supabase.co
Publishable API Key: sb_publishable_ttWWBZfH2MBPnKo7MK-yPQ_-ArmyPD7
Password: CompSciPrep!23
ref: szmuvnnawnfclcusfxbs
secret key: sb_secret_eupIjTlePoF5HuDJ9L1uGw_ryaMXgeM

resend - matchtal-prod api key: re_Efm1Jyqe_4NGrqJ2n7Gb8tegsRm3WQtAS



