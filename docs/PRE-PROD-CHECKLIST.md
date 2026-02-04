# Pre-production deployment checklist (since last deploy)

Use this list when deploying the current changes to production. Follow in order.

---

## 1. Database migrations

Apply all pending migrations. From repo root:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF   # if not already linked
npx supabase db push
```

**Do not** run `supabase db reset` in production.

**New migrations in this release** (ensure these are applied):

| Migration | Purpose |
|-----------|--------|
| `20260128170000_profiles_first_last_name.sql` | Adds `first_name`, `last_name` to `profiles`; adds `update_own_profile` RPC for admin/candidate profile editing. |
| `20260128180000_candidate_invites.sql` | Adds `candidate_invites` table and `accept_candidate_invite` RPC so Org Admins can invite candidates by email. |

If you prefer to run only new migrations manually in Supabase SQL Editor, run the contents of these two files in timestamp order. Otherwise `db push` applies everything in order.

**Note:** If `update_own_profile` already exists and is owned by another role, the migration catches "insufficient_privilege" and skips; profile editing may still work with the existing function.

---

## 2. Edge Functions

### Deploy new function

- **`send-candidate-invite`** — Org Admin invites candidates by email (same pattern as recruiter/manager invite). Must be deployed.

```bash
npx supabase functions deploy send-candidate-invite
```

### Redeploy updated function

- **`get-invite-details`** — Now resolves `candidate_invites` in addition to org_admin, manager, and recruiter invites; returns `role: 'candidate'` for candidate invite tokens.

```bash
npx supabase functions deploy get-invite-details
```

### Deploy all (optional)

```bash
npx supabase functions deploy
```

**Secrets:** No new secrets. Existing `RESEND_API_KEY`, `RESEND_FROM`, and `PUBLIC_APP_URL` are used for candidate invite emails.

---

## 3. Frontend (Render / static host)

- **Build:** No new env vars. Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set as before.
- **Deploy:** Commit, push to your production branch; trigger deploy (or rely on auto-deploy).

```bash
git add -A
git commit -m "Prod: candidate invites, admin UI, profiles, branding"
git push origin main
```

---

## 4. Post-deploy verification

- [ ] **Migrations:** In Supabase → SQL Editor, confirm `candidate_invites` table exists and `update_own_profile` exists (e.g. `SELECT 1 FROM information_schema.tables WHERE table_name = 'candidate_invites';`).
- [ ] **Candidate invite:** As Org Admin, open **Candidates** tab → **Invite Candidate** → send invite; open link in incognito and complete signup; confirm user is linked to org as candidate.
- [ ] **Profile edit:** As Platform Admin or Org Admin, open **Profile** in sidebar; edit name/phone and save; confirm no "Failed to update profile" and data persists.
- [ ] **Branding:** Sidebar shows "UltraHire"; title bar shows user name (or email) and "Platform Admin" / "Org Admin" on all pages.
- [ ] **Org Admin overview:** Overview tab shows "Organization summary", stat cards, pending invites (if any), and Quick actions cards with descriptions.

---

## 5. Summary of changes in this release

| Area | Change |
|------|--------|
| **Auth / invites** | Candidate invites: Org Admin can invite by email; invitee signs up as candidate and is linked to org. `get-invite-details` and Auth flow support `role: 'candidate'`. |
| **Profiles** | `profiles.first_name`, `profiles.last_name`; `update_own_profile` RPC; Admin and Org Admin profile pages. |
| **Admin UI** | Platform Admin: UltraHire branding, name + "Platform Admin" in title bar; Create tenant in dialog; single top section per tab; Remove Org Admin. Org Admin: same branding/title pattern; Invite Candidate in dialog; improved Overview with Quick actions cards; name/email near logout. |
| **Layout** | Shared AdminShell: UltraHire in sidebar; Org name under UltraHire for Org Admin; static title bar (name + role). |

---

## 6. Rollback (if needed)

- **Frontend:** Redeploy previous commit from Render.
- **Edge Functions:** Redeploy previous versions if you use versioning; or redeploy from an earlier commit.
- **DB:** Migrations are additive (new table, new columns, new RPC). To "rollback" you would need to write and run a down-migration (e.g. drop `candidate_invites`, drop `update_own_profile`). Prefer fixing forward unless critical.

---

*Last updated for release including candidate invites, profile editing, and admin UI/branding updates.*
