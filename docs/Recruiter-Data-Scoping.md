# Recruiter vs Shared Data Scoping

## Design (per product)

- **Talent Management** = **shared** across the organization  
  - One common repo of **profiles** (talent pool, search, uploads, imports).  
  - AM and all recruiters see the same candidates; anyone can search, upload, and add to the org talent pool.

- **Jobs, Pipelines, Communications** (and related) = **owned per recruiter**  
  - **My Jobs** – only jobs I created (or that I own).  
  - **My Applicants** – applicants to my jobs only.  
  - **Applications Pipeline** – my jobs’ applications only.  
  - **Engagement Pipeline** – my engagements only (already has `owner_user_id`).  
  - **Interviews** – tied to my jobs/applications.  
  - **Outreach / Email Templates** – my campaigns and templates only.

So: shared **profiles**; everything else under Jobs / Pipelines / Communications is **per-recruiter**.

## AM acting as Recruiter

When an AM switches to “Recruiter” (same account, role switch), they operate as a **recruiter**: they see only **their own** Jobs, Applicants, Pipelines, Communications. They still see the **same** Talent Management data (org talent pool) as everyone else.

## Shortlists (Talent Management)

Shortlists live under Talent Management. Two options:

- **Option A – Shared:** Keep shortlists org-wide (current behavior). Any recruiter can see and use any shortlist; good for shared “project” lists.
- **Option B – Per recruiter:** Scope shortlists by `created_by` so each recruiter has “My Shortlists” only.

Recommendation: **Option B** (“My Shortlists”) is more consistent with “my” data outside Talent Management and avoids one recruiter editing another’s list. The **profiles** in the pool stay shared; only the **list** is owned. If you prefer team shortlists, use Option A.

## Implementation status

- **DB:** `jobs.recruiter_id`, `candidate_engagements.owner_user_id`, `candidate_shortlists.created_by`, etc. already exist.
- **Engagement Pipeline:** Already filters by current user when role is recruiter (`effectiveOwnerUserId`).
- **Candidate Pipeline:** Had “view as owner” for AM only; recruiters saw all org jobs. **Fixed:** recruiters now see only their jobs (filter by `recruiter_id` = current user).
- **Recruiter Jobs / My Applicants / Dashboard / AI Matching / JobApplicants / CreateJob / EditJob:** Previously scoped by `organization_id` only. **Fixed:** scoped by current user’s `recruiter_id` when role is recruiter.
- **Email Templates / Outreach / Search Agents / Interviews:** Scoped by `created_by` (templates, campaigns, agents) and by recruiter's jobs (interviews).

## Summary

Your split is correct:

- **Shared:** Talent Management (common profile repo; search, upload, talent pool).  
- **Per recruiter:** Jobs, My Applicants, Pipelines, Communications (and Automation if you want agents per recruiter).

AM as recruiter = one more recruiter in the org: same shared pool, own jobs/pipelines/comm.
