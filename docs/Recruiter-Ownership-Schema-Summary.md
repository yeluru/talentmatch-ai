# Recruiter & org ownership – DB schema summary

This doc summarizes how the database models **org-wide vs recruiter-owned** data so that “recruiter functionality” (talent pool, jobs, shortlists, etc.) is clear without needing new migrations for the current design.

---

## Design principles

1. **Talent pool (candidates visible to the org)** = **org-wide**. All recruiters (and account managers) in the org see the same pool of candidates linked to that org.
2. **Things a recruiter creates** (jobs, shortlists, engagements, sourced leads, etc.) = **owned by that recruiter** (and scoped to the org). The DB stores `created_by` or equivalent so we know who created/owns them.

---

## Table-by-table

### Talent pool (org-wide, shared)

| Concept | Table(s) | Ownership | Notes |
|--------|----------|-----------|--------|
| **Candidates in org’s pool** | `candidate_org_links` | **Org-wide** | Many-to-many: candidate ↔ organization. Once a candidate is linked to an org, **all** staff in that org can see them (RLS: `recruiter_can_access_candidate` = linked to org OR applied to org job OR in org shortlist). |
| **Who added candidate to org** | `candidate_org_links.created_by` | Informational | Tracks who created the link; does not restrict who can see the candidate. |
| **Candidate profile data** | `candidate_profiles` | Global row | Profile is one row per candidate (person). Visibility to recruiters is via links + applications + shortlists (no single “org_id” on profile for access). |

So: **all talent pool profiles visible to an org are common for everyone in that org** – by design. No per-recruiter talent pool.

---

### Recruiter-created (belong to that recruiter / org)

| Entity | Table | Owner / creator column(s) | Notes |
|--------|--------|---------------------------|--------|
| **Jobs** | `jobs` | `recruiter_id` (NOT NULL), `created_by` (nullable) | Job is created by a recruiter; both columns exist. App sends `recruiter_id` on create. `created_by` was added later and backfilled from `recruiter_id`; new inserts should set both for consistency. |
| **Shortlists** | `candidate_shortlists` | `created_by` (NOT NULL) | Shortlist belongs to the org and was created by that user. |
| **Shortlist membership** | `shortlist_candidates` | `added_by` (NOT NULL) | Who added the candidate to the shortlist. |
| **Candidate engagements** | `candidate_engagements` | `owner_user_id`, `created_by` | Used for “this recruiter’s pipeline”; AM oversight uses `owner_user_id`. |
| **Sourced leads** | `sourced_leads` | `created_by` (NOT NULL) | Who created the lead (e.g. from search/upload). |
| **Email templates** | `email_templates` | `created_by` (NOT NULL) | Org-scoped; creator tracked. |
| **Outreach campaigns** | `outreach_campaigns` | `created_by` (NOT NULL) | Campaign created by that user. |
| **Search agents** | `ai_recruiting_agents` | `created_by` (NOT NULL) | Search agent created by that user; job_id required. |

So: **jobs (and other recruiter-created entities) do belong to that particular recruiter** in the schema; talent pool is the only major “shared” construct.

---

### Applications (derived from job)

| Entity | Table | Ownership | Notes |
|--------|--------|-----------|--------|
| **Applications** | `applications` | Via `job_id` | Application is tied to a job; job has `recruiter_id` / `created_by`. So “applications for my jobs” is well-defined per recruiter. |

---

## RLS (access control)

- **Jobs:** Staff in the org can see org jobs (policies use `organization_id = get_user_organization(auth.uid())` and role). No RLS policy restricts by `recruiter_id` for read; so **all org staff see all org jobs**, but the **owner** is stored for reporting/UX (e.g. “My Jobs” can filter by `created_by` or `recruiter_id`).
- **Talent pool:** Recruiters see candidates that `recruiter_can_access_candidate(candidate_id)` allows (org links, applications to org jobs, org shortlists).
- **Shortlists / engagements / sourced_leads:** Org-scoped; creator/owner stored for filtering and AM oversight.

---

## Conclusion

- **Talent pool** = org-wide by design; no DB change needed for “shared pool”.
- **Jobs** = already belong to the creating recruiter (`recruiter_id`, `created_by`). No migration required for that; optional app change: set `created_by` on job insert if not already set.
- Other recruiter-created entities (shortlists, engagements, sourced leads, templates, campaigns, agents) already have `created_by` or `owner_user_id` where appropriate.

So the current design was implemented **with** the right DB shape; the recruiter nav/AM changes were about exposing existing capabilities in the UI, not changing who owns what in the database.
