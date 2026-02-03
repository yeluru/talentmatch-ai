# Account Manager vs Recruiter: Design Recommendation

## Current State (from code scan)

### Sidebar for Account Manager
When `currentRole === 'account_manager'`, the left nav shows **two sections**:

1. **Team & Oversight**
   - Dashboard, Team, Jobs Overview, Analytics, Clients, Organization, Audit Logs  
   - (`accountManagerOversightNavItems` in `DashboardLayout.tsx`)

2. **Recruiting**
   - Recruiter Dashboard + full recruiter nav (Talent Management, Jobs, Pipelines, Communications, Insights, Automation)  
   - Same groups as pure recruiters (`recruiterNavGroups`)

### Routes
- **Manager routes** (`/manager/*`): `allowedRoles: ["account_manager"]` only.
- **Recruiter routes** (`/recruiter/*`): `allowedRoles: ["recruiter", "account_manager", "org_admin", "super_admin"]`.

So account managers can open every recruiter page; they get both oversight and full recruiting in one view.

### Role model
- A user can have **multiple roles** (e.g. `account_manager` and `recruiter` in `user_roles`).
- **Role switcher** in the header (when `roles.length > 1`) lets them switch between “Account Manager” and “Recruiter” (and others).
- One login, multiple roles; no need for separate accounts for AM vs Recruiter.

---

## The Tension You’re Describing

- **Ideal:** Account manager = **oversight**: see recruiters’ work, assign work, track progress. Not necessarily doing every recruiter task (post jobs, run pipelines, etc.).
- **Reality today:** AM sees full recruiter nav, so it looks like “AM = recruiter + extra,” which blurs the oversight vs execution roles.
- **Solo AM+Recruiter:** One person who is both. You were thinking they might need two accounts; in the current model they don’t—they have one account with two roles and switch.

---

## Recommended Design: Oversight-Only AM + Role Switch for Recruiting

If you were to redo it, this keeps the model clear and supports both “AM only” and “AM who also recruits.”

### 1. Account Manager nav = oversight only

**Show only the “Team & Oversight” section** in the sidebar when `currentRole === 'account_manager'`:

| Item            | Purpose |
|-----------------|--------|
| Dashboard       | Org/team metrics, recent activity, quick links to team/jobs. |
| Team            | List recruiters (and other AMs if any), assign AM↔recruiters, invite, view progress. |
| Jobs Overview   | See all org jobs, status, who owns what—no editing unless they also switch to Recruiter. |
| Analytics       | Funnel, applications, team performance. |
| Clients         | Manage client companies (if you use this). |
| Organization    | Org settings, branding, etc. |
| Audit Logs      | Who did what, for compliance and oversight. |

**Do not show** the “Recruiting” section (Recruiter Dashboard, Talent Pool, My Jobs, Pipelines, etc.) in the AM sidebar at all.

- **Pure AM:** They only see oversight. No recruiter links, so the product clearly says “your job is to oversee, not to run pipelines.”
- **AM who is also a recruiter:** They use the **role switcher** to switch to “Recruiter”; then they get the full recruiter sidebar and all recruiter routes. No second account.

### 2. One account, two “modes” (no separate accounts)

- **One user, two roles:** Same person has `account_manager` and `recruiter` in `user_roles` (same org). They log in once; in the header they see “Account Manager” and “Recruiter” in the role dropdown.
- **Account Manager:** Sidebar = oversight only; URL space `/manager/*`.
- **Recruiter:** Sidebar = full recruiter nav; URL space `/recruiter/*`.
- So: “Company with one AM who also recruits” = one account, switch role when they want to do recruiting work. No need to create a separate “recruiter” account.

### 3. Make “also do recruiting” obvious (optional but helpful)

- In the **Manager Dashboard** (and maybe in the sidebar footer), when the user has **both** `account_manager` and `recruiter`:
  - Show a small card or line: **“Also do recruiting? Switch to Recruiter”** (or “Work as Recruiter”) that calls `switchRole('recruiter')` and navigates to `/recruiter`.
- This avoids the “where do I go to do recruiter work?” moment without putting recruiter nav in the AM sidebar.

### 4. Keep recruiter routes open to AM (for deep links / future)

- You can keep `allowedRoles` for recruiter routes as `["recruiter", "account_manager", ...]` so that:
  - Links from Manager (e.g. “View job” → `/recruiter/jobs/:id`) still work when an AM clicks them (e.g. read-only or limited actions).
  - Or you can require “must be in Recruiter role to see recruiter pages” and redirect AMs to “Switch to Recruiter” when they hit a recruiter URL—your product choice.

### 5. Optional: “View as recruiter” without full switch

- Alternative to full role switch: add a single sidebar entry under AM, e.g. **“Open Recruiting”**, that:
  - Opens `/recruiter` in the same tab (or new tab), and
  - Either keeps `currentRole === 'account_manager'` but allows access to recruiter routes, or temporarily switches context to recruiter for that tab.
- This is a smaller change than full oversight-only but can still feel like “AM + recruiter in one place.” The cleanest mental model is still “AM = oversight nav only; Recruiter = recruiting nav; switch role to change mode.”

---

## Summary Table

| Scenario | Who | Login | What they see |
|---------|-----|--------|----------------|
| Org with 1 AM + N recruiters | AM only | 1 login | Oversight nav only (Dashboard, Team, Jobs Overview, Analytics, Clients, Org, Audit). No recruiter nav. |
| Same org | Recruiters | Each has own login | Full recruiter nav; no AM nav. |
| Org with 1 person = AM + Recruiter | Same person | **1 login**, 2 roles | When “Account Manager”: oversight nav only. When “Recruiter”: full recruiter nav. Switch via header role dropdown (and optional “Also do recruiting?” on Manager Dashboard). |

---

## Implementation Sketch (if you adopt this)

1. **DashboardLayout.tsx**  
   For `currentRole === 'account_manager'`:
   - Render only `accountManagerOversightNavItems` (and the “Team & Oversight” section).
   - Remove the entire “Recruiting” block (Recruiter Dashboard + `recruiterNavGroups`) from the AM sidebar.

2. **Manager Dashboard**  
   If `roles.some(r => r.role === 'recruiter')`:
   - Add a card or CTA: “Also do recruiting? Switch to Recruiter” that runs `switchRole('recruiter')` and `navigate('/recruiter')`.

3. **Recruiter routes**  
   - Either keep `account_manager` in `allowedRoles` (so AM can open recruiter links when needed), or remove it and force “Switch to Recruiter” for any recruiter URL. The doc above assumes you keep access so deep links work; you can tighten later if you want strict “recruiter only when in Recruiter role.”

4. **No DB or invite flow change**  
   - Same invite/role assignment as today (AM, Recruiter, or both for the same user). Only the sidebar and optional CTA change.

---

## If You Prefer to Keep “Recruiting” in AM Sidebar

If you want to keep the current “AM sees both sections” but clarify intent:

- **Rename/label** the second section to something like: **“Recruiting (when you’re also doing recruiter work)”** and add a short subtitle: “Use these when you’re acting as a recruiter; switch to Recruiter role to focus on recruiting.”
- **Optional:** Only show the Recruiting section when the user has the `recruiter` role (i.e. `roles.some(r => r.role === 'recruiter')`). So “pure” AM (no recruiter role) sees only oversight; AM+Recruiter sees both.

That keeps one sidebar but makes the distinction clearer and avoids showing recruiter nav to AM-only users.

---

**Bottom line:** For a clean redo, **Account Manager = oversight-only nav**. People who are both AM and Recruiter use **one account and the role switcher** to move between “oversee” and “do recruiting”; no need for separate accounts. The optional “Also do recruiting?” on the Manager Dashboard makes that path obvious.
