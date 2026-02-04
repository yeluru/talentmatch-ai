# Roles and Responsibilities — Detailed Matrix

This document merges **Recruitment Work Flow Chart.pdf** (workflow duties) with **RBAC-for-Product.txt** (permissions) and the **current codebase** to describe each role, its responsibilities in detail, and implementation status.

**Status legend**

| Status | Meaning |
|--------|--------|
| **Done** | Implemented and available in the app. |
| **Partial** | Partially implemented (e.g. data model exists but no approval UI, or vice versa). |
| **To be done** | Not implemented; required for full workflow. |

**Sources**

- **Workflow PDF**: *Recruitment Work Flow Chart.pdf* (Org Admin / Account Manager / Recruiter / Candidate / System / Client duties).
- **RBAC**: *RBAC-for-Product.txt* (permissions and scope).
- **Code**: Routes, pages, Edge Functions, and DB (invites, pipelines, shortlists, engagements, etc.).

---

## 1. Platform Admin (super_admin)

**Scope:** Platform-wide (all tenants). Internal ops only.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Create tenant (organization) | Create new customer organization; first Org Admin is set via invite. | RBAC, code | **Done** |
| Invite Org Admin | Send invite link; invitee signs up and becomes Org Admin for that org. | RBAC, code | **Done** |
| Revoke Org Admin | Remove Org Admin role from a user (remove access). | RBAC, code | **Done** |
| View all organizations & users | Read-only visibility across tenants for support/monitoring. | RBAC, code | **Done** |
| View candidates (read-only) | See candidate data across platform; no edit/delete from UI. | RBAC, code | **Done** |
| Profile (name, contact) | Edit own profile (first name, last name, phone). | Code | **Done** |
| Suspend/delete users | Not exposed in app UI; handled via Supabase Studio / controlled ops. | RBAC | **To be done** (by design: out of app) |

---

## 2. Org Admin (org_admin)

**Scope:** Own organization only. Governance, approvals, configuration (Workflow PDF); user and candidate management (RBAC).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| **Governance & approvals (PDF)** | | | |
| Job creation & approval | Approve new role/job before it goes live or is visible. | Workflow PDF | **To be done** (jobs are created by recruiters; no formal “approve job” step in app) |
| Recruiter assignment | Assign recruiters to roles/teams or to Account Managers. | Workflow PDF, RBAC | **Done** (invite recruiters; optional AM↔recruiter assignment in Org Admin) |
| Offer approval | Approve offer before it is released to candidate. | Workflow PDF | **To be done** (offer stage exists; no approval gate) |
| **User management** | | | |
| Invite Account Managers | Send invite link; invitee becomes Account Manager in org. | RBAC, code | **Done** |
| Invite Recruiters | Send invite link; invitee becomes Recruiter in org. | RBAC, code | **Done** |
| Invite Candidates | Send invite link; invitee signs up and is linked to org as candidate. | RBAC, code | **Done** |
| Remove Account Managers / Recruiters | Revoke role (remove from org). | RBAC, code | **Done** |
| View all users in org | List account managers, recruiters, linked candidates. | RBAC, code | **Done** |
| Assign Recruiter ↔ Account Manager | Optional assignment of recruiters to AMs. | Code | **Done** (account_manager_recruiter_assignments) |
| **Candidate management** | | | |
| View candidates linked to org | See org-linked candidates. | RBAC, code | **Done** |
| Link/unlink candidates to org | Add or remove candidate–org association. | RBAC, code | **Done** |
| Add internal notes/status on candidates | Org-level notes and status (e.g. New, Shortlisted, Rejected). | RBAC, code | **Done** (Org Admin Dashboard – Candidates tab) |
| **Configuration & compliance** | | | |
| View org audit logs | Tenant-scoped audit logs for compliance and troubleshooting. | RBAC, code | **Done** |
| Profile (name, phone) | Edit own first name, last name, phone. | Code | **Done** |
| Organization settings | Configure company profile / branding (if exposed). | RBAC | **Partial** (org exists; org-level settings UI may be limited) |

---

## 3. Account Manager (account_manager)

**Scope:** Own organization only. Client-facing, demand, alignment (Workflow PDF); recruiter and oversight (RBAC).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| **Client-facing & alignment (PDF)** | | | |
| Client requirement briefing | Capture JD (job description) and client expectations. | Workflow PDF | **Partial** (Client Management exists; JD/requirements can be captured; formal “briefing” flow not explicit) |
| Candidate shortlist review | Review shortlists before submission to client. | Workflow PDF | **Partial** (AM can view recruiters’ pipelines/shortlists; no dedicated “review shortlist” approval step) |
| Offer rollout | Release offer to candidate (after internal approval). | Workflow PDF | **To be done** (no “release offer” gate; recruiters move to offer stage) |
| **Oversight (RBAC / code)** | | | |
| Invite Recruiters | Send invite link; invitee becomes Recruiter in org. | RBAC, code | **Done** |
| Remove Recruiters | Revoke Recruiter role within org. | RBAC, code | **Done** (via Team) |
| Assign recruiters to self | Be assigned specific recruiters (AM↔recruiter assignment). | Code | **Done** (account_manager_recruiter_assignments) |
| View team (recruiters, AMs) | List recruiters and account managers in org. | RBAC, code | **Done** (Manager Team) |
| View recruiter progress | See applications, pipeline stages, activity per recruiter. | Code | **Done** (Manager Recruiter Progress) |
| View org jobs overview | See all jobs in org, status, ownership. | RBAC, code | **Done** (Manager Jobs) |
| View analytics | Funnel, applications, team performance. | Code | **Done** (Manager Analytics) |
| Manage clients | Create/edit client companies and requirements. | Code | **Done** (Client Management) |
| View audit logs | Org-scoped audit logs. | Code | **Done** (Manager Audit Logs) |
| Switch to Recruiter role | When user has both AM and Recruiter roles, switch to do hands-on recruiting. | Code | **Done** (role switcher + “Also do recruiting?” CTA) |
| **Organization** | View org settings / branding. | Code | **Done** (Manager Organization) |

---

## 4. Recruiter (recruiter)

**Scope:** Own organization only. Execution: sourcing → screening → shortlisting → interview → offer → onboarding (Workflow PDF + code).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| **Requirement intake & staging** | | | |
| Create jobs (role/job posting) | Post new job; set visibility (public/private), JD, etc. | Workflow PDF, code | **Done** (Create Job, Edit Job) |
| Requirement intake | Capture JD and requirements (part of job creation). | Workflow PDF, code | **Done** (job form) |
| **Sourcing & talent** | | | |
| Talent pool search | Search internal talent pool (and external if integrated). | Workflow PDF, code | **Done** (Talent Pool, Talent Search, ATS Match Search) |
| Marketplace profiles | Browse opted-in discoverable candidates. | Code | **Done** (Marketplace Profiles) |
| Bulk upload / sourcing | Import candidates (bulk upload, talent search, API). | Code | **Done** (Talent Sourcing, bulk import) |
| Outreach to candidates | Send outreach and engagement emails. | Workflow PDF, code | **Done** (Engagement Pipeline, send-engagement-email) |
| **Screening & shortlisting** | | | |
| Profile screening | Screen resume/profile. | Workflow PDF, code | **Done** (applicant detail, status, notes) |
| Pre-screen call | Conduct screening call (tracked via status/notes). | Workflow PDF, code | **Partial** (status + notes; no dedicated “call” artifact) |
| Shortlisting | Create and manage candidate shortlists. | Workflow PDF, code | **Done** (Shortlists) |
| Candidate shortlist review (with AM) | AM can review; recruiter maintains shortlist. | Workflow PDF | **Partial** (AM can view; no formal “submit for review” flow) |
| **Submission & interview** | | | |
| Client submission | Submit profiles/shortlist to client. | Workflow PDF | **To be done** (no “submit to client” step; clients are in app but submission workflow not formalized) |
| Interview scheduling | Coordinate availability and schedule interviews. | Workflow PDF, code | **Done** (Interview Schedule) |
| Feedback communication | Update candidate with feedback (notes, status). | Workflow PDF, code | **Done** (applicant/engagement detail, status, notes) |
| **Offer & closing** | | | |
| Offer & negotiation | Move candidate to offer stage; send offer engagement (e.g. offer request). | Workflow PDF, code | **Done** (application stage “offered”; engagement type “offer”; candidate can accept/reject/counter) |
| Joining coordination | Track joining/onboarding. | Workflow PDF, code | **Partial** (engagement stage “onboarding”; no dedicated joining checklist) |
| Closure & handoff | Mark hire/closure; reporting. | Workflow PDF, code | **Partial** (hired/closed stages; analytics; no formal “closure” workflow) |
| **Other** | | | |
| AI matching | Run AI candidate–job matching. | Code | **Done** (AI Matching) |
| Pipelines | Applications pipeline (by stage) and Engagement pipeline (rate, RTR, screening, submission, offer, onboarding). | Code | **Done** (Candidate Pipeline, Engagement Pipeline) |
| Email templates | Reusable email templates. | Code | **Done** (Email Templates) |
| Talent insights | Data-driven insights. | Code | **Done** (Talent Insights) |
| AI Agents | Configure and run AI recruiting agents. | Code | **Done** (AI Agents) |

---

## 5. Candidate (candidate)

**Scope:** Self (own profile, resumes, applications). Engagement and responses (Workflow PDF).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| **Application & profile** | | | |
| Application submission | Apply to jobs; share profile/resume. | Workflow PDF, code | **Done** (Job Search, apply, My Applications) |
| Profile management | Edit own profile (skills, experience, education, etc.). | RBAC, code | **Done** (Candidate Profile) |
| Resume upload & management | Upload and manage resumes; select resume per application. | RBAC, code | **Done** (Candidate Resumes) |
| **Engagement & responses (PDF)** | | | |
| Interview confirmation | Confirm or decline interview schedule. | Workflow PDF, code | **Partial** (interview flow exists; explicit “confirm schedule” may be via link/email) |
| Offer acceptance | Accept, decline, or counter offer. | Workflow PDF, code | **Done** (CandidateEngagementRequest – offer type: accept/reject/counter) |
| Rate confirmation | Respond to rate confirmation requests (accept/reject/counter). | Code | **Done** (engagement request page) |
| **Discovery & tools** | | | |
| Job search & browse | Browse/search jobs (public + org-visible). | Code | **Done** (Job Search, Job Details) |
| Job alerts | Get notified when matching jobs are posted. | Code | **Done** (Job Alerts) |
| AI analysis | Get AI-powered resume feedback. | Code | **Done** (AIAnalysis) |
| Resume workspace | Tailor resume to job description; export. | Code | **Done** (Resume Workspace) |
| Engagement request link | Open link from email to view and respond to recruiter requests (rate, offer, etc.). | Code | **Done** (CandidateEngagementRequest) |
| Self-signup | Only role that can self-sign up; staff are invite-only. | RBAC, code | **Done** |
| Org-linked via invite | Can be invited by Org Admin and linked to org as candidate. | RBAC, code | **Done** (send-candidate-invite, accept_candidate_invite) |

---

## 6. System (automation)

**Scope:** Backend/Edge Functions; automation, nudges, state changes (Workflow PDF).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Candidate status update | Update application/engagement stage and notify (e.g. email). | Workflow PDF, code | **Done** (status transitions; notify-application; send-engagement-email) |
| Closure & reporting | Mark closure; analytics and reporting. | Workflow PDF, code | **Partial** (analytics/reporting exist; “closure” as a formal event not fully standardized) |
| Email delivery | Send transactional emails (invites, engagement, notifications). | Code | **Done** (Resend + Edge Functions) |
| AI parsing & matching | Resume parsing, job parsing, candidate matching. | Code | **Done** (parse-resume, match-candidates, etc.) |

---

## 7. Client (external / hiring manager)

**Scope:** Referenced in Workflow PDF (interview feedback, assessment types, approval layers). Not a first-class app role today.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Interview feedback | Share feedback after interviewing candidate. | Workflow PDF | **To be done** (no client login/portal; feedback could be collected offline or via future client portal) |
| Assessment types | Define or use assessment types for roles. | Workflow PDF | **To be done** (no structured assessment types in app) |
| Approval layers | Approve shortlist, offer, etc. | Workflow PDF | **To be done** (Org Admin “offer approval” and “shortlist review” not yet implemented as gates) |

---

## Summary by status

| Status | Count (across all roles) | Notes |
|--------|--------------------------|--------|
| **Done** | Majority | Core flows: invites, pipelines, shortlists, engagements, applications, offer/rate responses, AM oversight, Org Admin user/candidate management. |
| **Partial** | Several | Job/offer approval gates, client submission, shortlist review, joining/closure workflow, org settings. |
| **To be done** | Few | Formal job/offer approval (Org Admin/AM), client portal (feedback, approval layers), assessment types, user suspend/delete in UI (if ever desired). |

---

*Generated from Recruitment Work Flow Chart.pdf, RBAC-for-Product.txt, and current codebase. Last updated to reflect roles and implementation status.*
