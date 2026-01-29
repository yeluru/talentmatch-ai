# Account Manager: Functional Improvements (Non-Technical)

**Context:** One or more recruiters report to one Account Manager per organization. The Account Manager should oversee recruiters’ productivity, work in progress, and be able to override selected actions. This document lists suggested improvements from a **functionality perspective** so the app becomes more powerful for Account Managers.

**Principle: Account Manager = Recruiter + Manager.**  
An Account Manager is a recruiter with additional oversight and override powers—not the other way around. So AMs should have **full recruiter capabilities** (create jobs, post jobs, talent search, talent pool, shortlists, pipelines, communications, etc.) **plus** manager-specific views and overrides. That way AMs can fill roles themselves, help their team when needed, and still oversee and correct work.

---

## Current State (Summary)

**What Account Managers have today:**
- **Dashboard:** Org-level stats (open jobs, *their* recruiter count, candidates, applications), invite codes, team list, recent applications.
- **Team:** View only *assigned* recruiters; invite recruiter, remove recruiter, re-invite/cancel invites; link to each recruiter’s **Progress** page.
- **Recruiter Progress:** Per-recruiter engagement pipeline (stage counts + recent engagements); link to full Engagement Pipeline filtered by that recruiter.
- **Candidates:** View all org candidates; search/filter/sort; open candidate detail (TalentDetailSheet — status/notes can be updated if RLS allows).
- **Jobs Overview:** Read-only list of org jobs (counts by status, list with applicant counts). No edit, no drill-down to applicants.
- **Analytics:** Org-wide totals (jobs, applications, candidates, applications by status). No per-recruiter breakdown.
- **Clients, Organization, Audit Logs:** Standard manager-level access.

**Defined but underused:** The app already defines “override” capabilities for Account Managers (edit any job, override engagement, manage templates, merge/override candidate links). Most of these are either not exposed in the Manager UI or only available indirectly (e.g. Engagement Pipeline with `?owner=`).

---

## Suggested Improvements (Functionality)

### 1. **Productivity & work-in-progress oversight**

- **Per-recruiter productivity dashboard**  
  One place (e.g. from Team or a new “Productivity” view) to see, per recruiter:
  - Engagements by stage (already in Recruiter Progress).
  - Number of candidates added/sourced (e.g. from talent pool / shortlists / sourced leads by that recruiter).
  - Shortlists created and size.
  - Applications pipeline activity (e.g. moved to interview, offer).
  - Optional: simple targets vs actuals (e.g. submissions per week).

- **“My recruiters” filter across Manager views**  
  - In **Candidates:** Filter to “Candidates touched by my recruiters” (e.g. added to pool, in shortlist, or in engagement by an assigned recruiter) so the AM can focus on their team’s pipeline.
  - In **Jobs Overview / Analytics:** Option to see metrics or lists scoped to jobs (or activity) tied to their recruiters, where the data model supports it.

- **Recruiter workload at a glance**  
  On Team or Recruiter Progress: show a small summary per recruiter (e.g. open engagements, active shortlists, recent applications) so the AM can spot overload or underuse without opening each page.

### 2. **Oversight of pipelines (not only engagement)**

- **Applications pipeline by recruiter (or by job)**  
  - From Manager: view applications pipeline (e.g. Applied → Screen → Interview → Offer) either per job or with a “recruiter” or “job owner” lens so the AM can see where their team’s applicants are stuck.
  - Optional: allow AM to move applications between stages (e.g. unstick a submission) with an “override” or “Account Manager action” label for audit.

- **Shortlists oversight**  
  - List shortlists for the org (or for “my recruiters” if scoped); see which recruiter owns each shortlist and for which job.
  - Optional: view-only access to shortlist contents; optional override (e.g. remove candidate from shortlist, reassign shortlist owner) with audit.

- **Sourcing activity**  
  - View sourcing activity for “my recruiters” (e.g. uploads, search/API usage, sourced leads) in a simple list or summary so the AM can see who is actively sourcing and volume.

### 3. **Override actions (make them explicit and auditable)**

- **Jobs**  
  - From **Jobs Overview:** “Edit” (and optionally “Close” / “Reopen”) for any org job, with a clear “Account Manager override” or “Edited by AM” in the UI and in audit logs.
  - Optional: “View applicants” from Jobs Overview to open the applicant list for that job (read-only or with stage-override if desired).

- **Engagements**  
  - Keep the current ability to move engagement stages and skip/trigger emails when viewing a recruiter’s pipeline (e.g. via Recruiter Progress → Engagement Pipeline).
  - Make it obvious in the UI that the AM is acting in “override” mode (e.g. banner: “Viewing as Account Manager – changes will be attributed to you”).

- **Candidates**  
  - In **Manager Candidates:** Explicit “Override status” and “Override notes” (or “Add note as Account Manager”) so the AM can correct or align candidate status/notes without going through the recruiter view. All such changes should be auditable (who changed what and when).

- **Templates / settings (optional)**  
  - If the product wants AMs to own consistency: allow “Manage org email templates” from the Manager area (today this capability exists in permissions but may live only in the recruiter section). Same for any org-wide recruiting settings the AM should control.

### 4. **Reporting and analytics**

- **Analytics by recruiter**  
  - In **Analytics:** Add a “By recruiter” (or “My team”) view: e.g. applications submitted, interviews scheduled, offers, by recruiter and optionally by time period.
  - Optional: export (CSV/PDF) for “my recruiters” for use in 1:1s or leadership reporting.

- **Dashboard widgets for “my team”**  
  - On the main Manager Dashboard: a dedicated block for “My recruiters” with key numbers (e.g. open engagements, submissions this week, candidates added) and links to each recruiter’s Progress or Productivity view.

### 5. **Team and assignment clarity**

- **Clear “My recruiters” vs “All org”**  
  - Where relevant (Dashboard, Team, Candidates, Analytics), use labels or tabs like “My recruiters” vs “Full organization” so the AM always knows the scope of data they’re viewing.

- **No change to assignment model**  
  - Keep “one recruiter → one Account Manager” and assignment managed by Org Admin. Optionally: in Team, show “Assigned to me” vs “Other recruiters (other AMs)” if the AM is allowed to see that other recruiters exist in the org.

### 6. **Full recruiter capabilities for Account Managers**

- **Create and post jobs**  
  - Account Managers should be able to create jobs, post jobs, and manage job listings the same way recruiters do (e.g. “Post a Job”, “My Jobs”, edit/close). Today AMs can access recruiter routes; ensure the Manager nav or a combined nav gives AMs clear, one-click access to “Post a Job” and “My Jobs” so they are not blocked when they need to open or fill a role themselves.

- **Search like a recruiter**  
  - AMs should have the same talent-search tools as recruiters: **Talent Pool** (view/search org candidates), **ATS Match Search** (search by skills/requirements), **Talent Search** (Uploads, Search, API) so they can source and add candidates when needed. Ensure the Manager experience exposes these (e.g. via sidebar links to the same recruiter flows, or a “Recruiting” section for AMs that mirrors the recruiter nav).

- **Implementation note**  
  - Backend/RLS already allow `account_manager` for jobs, candidate access, and edge functions. The gap is **navigation and discovery**: when logged in as Account Manager, the sidebar shows only Manager items (Dashboard, Analytics, Team, Candidates, Jobs Overview, etc.) and not the full recruiter suite. Options: (a) show both Manager nav and Recruiter nav for AMs (e.g. “Manager” section + “Recruiting” section), or (b) add a “Recruiting” or “Do recruiting” area for AMs with links to Create job, My jobs, Talent pool, ATS Match Search, Talent Search (uploads/search/API), Pipelines, etc. Either way, AMs should be one click away from “Post a job” and “Search talent” like recruiters.

### 7. **Audit and compliance**

- **Audit log for overrides**  
  - Ensure all “override” or “Account Manager” actions (job edit, engagement stage change, candidate status/notes change, template change, etc.) are written to the audit log with actor role (e.g. “account_manager”) and a clear action type so compliance and managers can review who did what.

- **Optional: “Reason” or “Note” for overrides**  
  - For sensitive overrides (e.g. closing a job, moving an application stage), optional short reason or note that is stored and shown in the audit log.

---

## Priority order (suggestion)

1. **High:** Give AMs clear access to full recruiter flows (create/post jobs, talent pool, ATS match search, talent search); per-recruiter productivity summary; “My recruiters” filter on Candidates; Jobs Overview “Edit” (and optionally “View applicants”); explicit override labeling in Engagement Pipeline; audit log for overrides.
2. **Medium:** Applications pipeline view (by job or recruiter); shortlists oversight; Analytics by recruiter; Dashboard “My recruiters” widget.
3. **Lower:** Sourcing activity view; template/settings management from Manager area; optional “reason” for overrides.

---

## Next steps

- Review this list and adjust priorities or scope.
- Once agreed, add selected items to the product backlog / to-do and implement in phases (e.g. oversight first, then overrides, then analytics).
