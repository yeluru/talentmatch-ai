# TalentMatch AI — Functional Requirements (Industry-Standard)

This document describes **functional requirements** for TalentMatch AI, written to be:
- **Implementation-agnostic** (so you can re-build with React + Node.js APIs + NoSQL later).
- **Traceable** (each requirement has an ID).
- **Verifiable** (each requirement has acceptance criteria).
- Mapped to the **current codebase status** using **Done / To Be Done** labels.

Source inputs:
- `docs/RBAC-for-Product.txt` (roles and access in plain language)
- `docs/MatchTalAI - Functional requirements.docx` (ATS + AI recruitment functional scope)
- `docs/Juicebox.ai – An AI-Powered Recruiting Platform in Plain English.docx` (market-feature inspiration)
- Current codebase behavior in `src/` and `supabase/`

Status legend:
- **Done**: implemented in current codebase (may still need UX polish/tests).
- **To Be Done**: not implemented, partially implemented, or requires re-verification/hardening.

---

## 1) Actors, roles, and tenant model

### FR-001 — Multi-tenant isolation
- **Status**: **Done**
- **Description**: The system shall isolate customer data by organization (tenant) and prevent cross-tenant access.
- **Acceptance criteria**:
  - A user from Org A cannot read/write Org B’s protected data.
  - Enforcement happens server-side (not only client-side navigation).

### FR-002 — Supported roles
- **Status**: **Done**
- **Description**: The system shall support the following roles with distinct permissions and UI: `candidate`, `recruiter`, `account_manager`, `org_admin`, `super_admin`.
- **Acceptance criteria**:
  - A user’s role(s) determine accessible routes and backend access.
  - Role enforcement exists in the data layer (RLS/RPC or API authorization).

### FR-003 — Invite-only staff onboarding
- **Status**: **Done**
- **Description**: Staff roles (`org_admin`, `account_manager`, `recruiter`) shall be invite-only; only `candidate` can self-sign up.
- **Acceptance criteria**:
  - Public sign-up does not allow selecting staff roles.
  - Staff role assignment occurs only via privileged server-side logic (invite acceptance / RPC).

---

## 2) Authentication & account lifecycle

### FR-010 — Authentication (email/password)
- **Status**: **Done**
- **Description**: The system shall support email/password authentication.
- **Acceptance criteria**:
  - User can sign up, sign in, sign out.
  - Session persists and can be revoked/expired.

### FR-011 — Email confirmation
- **Status**: **Done** (prod/local **To Be Done** for reliability verification)
- **Description**: The system shall require email confirmation for new signups (at least candidates; staff via invite flow).
- **Acceptance criteria**:
  - New account requires email verification before full access.
  - Local dev environment provides a reliable way to view confirmation emails (e.g., Mailpit).

### FR-012 — Password reset
- **Status**: **Done**
- **Description**: The system shall support password reset via email.
- **Acceptance criteria**:
  - User can request reset and set a new password via email link.

### FR-013 — Role assignment security
- **Status**: **Done**
- **Description**: The system shall prevent users from self-escalating roles.
- **Acceptance criteria**:
  - No client-side write path can insert privileged roles for self.
  - Server-side policies/RPCs enforce who can assign/revoke roles.

---

## 3) Candidate portal (job seeker)

### FR-020 — Candidate profile management
- **Status**: **Done**
- **Description**: Candidates shall be able to view/update their profile details.
- **Acceptance criteria**:
  - Candidate can edit their own profile data.
  - No candidate can edit another candidate’s profile.

### FR-021 — Resume upload & management
- **Status**: **Done**
- **Description**: Candidates shall be able to upload and manage one or more resumes.
- **Acceptance criteria**:
  - Candidate can upload at least one resume.
  - Candidate can select a resume when applying to a job.

### FR-022 — Job browsing (authenticated candidate)
- **Status**: **Done** (expanded for marketplace visibility rules)
- **Description**: Candidates shall be able to browse/search jobs and view job details, respecting job visibility rules (private vs public).
- **Acceptance criteria**:
  - Candidate can list jobs and open a job detail page.
  - Public jobs are visible to all signed-in candidates.
  - Private jobs are visible only when the candidate is linked to the job’s organization (invite code or application creates link).

### FR-023 — Apply to job (authenticated candidate)
- **Status**: **Done**
- **Description**: Candidate shall be able to apply to a job with a selected resume and optional cover letter.
- **Acceptance criteria**:
  - Submitting creates an `applications` record with status `applied`.
  - Duplicate applies are prevented or handled gracefully.

### FR-024 — Public job page apply (unauthenticated candidate)
- **Status**: **Done**
- **Description**: Unauthenticated users shall be able to apply via a public job page, including resume upload and account creation/confirmation flow.
- **Acceptance criteria**:
  - User can upload a resume, see parsed fields, and proceed to sign up.
  - System creates candidate/profile and application record appropriately.
  - System links candidate ↔ job’s org on apply (so the candidate can see org ties and private jobs, if applicable).

### FR-027 — Candidate marketplace consent (discoverability opt-in)
- **Status**: **Done**
- **Description**: The system shall collect explicit candidate consent to be discoverable by employers outside a specific tenant context.
- **Acceptance criteria**:
  - Candidate can opt in during signup.
  - Recruiters can only view marketplace profiles for opted-in, actively-looking candidates.
  - Consent can be disabled later (Settings → Privacy).

### FR-025 — Application tracking
- **Status**: **Done**
- **Description**: Candidates shall be able to view their applications and statuses.
- **Acceptance criteria**:
  - Candidate sees list of applications with status and job info.

### FR-026 — Candidate AI resume/job analysis (“ATS score” style)
- **Status**: **Done (with deterministic scoring + improved parsing)**
- **Description**: Candidates shall be able to analyze resume vs job description and receive match score, missing skills, and recommendations.
- **Acceptance criteria**:
  - Analysis produces a score and actionable feedback.
  - Uses real extracted resume text (PDF + DOCX supported; legacy `.doc` not supported).
  - Score is explainable: deterministic JD keyword coverage blended with model score.

---

## 4) Recruiter portal (hiring workflows)

### FR-030 — Job creation (draft/publish)
- **Status**: **Done**
- **Description**: Recruiters shall be able to create jobs as draft or published, including structured fields (skills, requirements).
- **Acceptance criteria**:
  - Recruiter can create job tied to their organization.
  - Job can be published/closed.

### FR-031 — Job edit & status management
- **Status**: **Done**
- **Description**: Recruiters shall be able to edit existing jobs and change status.
- **Acceptance criteria**:
  - Recruiter can update job fields and status.

### FR-032 — Share public job link
- **Status**: **Done**
- **Description**: Recruiters shall be able to copy/open a public job URL for a job **only when the job is public**.
- **Acceptance criteria**:
  - Job list provides “copy/open” public URL actions when job visibility is `public`.

### FR-036A — Marketplace profiles browsing (recruiter)
- **Status**: **Done**
- **Description**: Recruiters shall be able to browse/search marketplace-discoverable candidate profiles (opt-in only).
- **Acceptance criteria**:
  - Recruiter can open a Marketplace Profiles page and search/filter discoverable profiles.
  - Recruiter can start an engagement to bring a marketplace profile into tenant workflow.

### FR-036B — Recruiter engagement workflow (tenant-scoped)
- **Status**: **Done** (basic stages + move-forward)
- **Description**: Recruiters shall be able to track engaged candidates through a tenant-scoped workflow: rate confirmation → RTR → screening → submission → onboarding.
- **Acceptance criteria**:
  - Starting engagement creates a tenant link and an engagement record.
  - Recruiter can advance stages in the engagement pipeline UI.
  - Engagement data is tenant-isolated.

### FR-033 — View applicants per job
- **Status**: **Done**
- **Description**: Recruiters shall be able to view applicants for a job with resume and candidate profile details.
- **Acceptance criteria**:
  - Applicants list loads from `applications` for the job.
  - Recruiter can open an applicant detail view.

### FR-034 — Applicant pipeline status updates
- **Status**: **Done**
- **Description**: Recruiters shall be able to update candidate application status (e.g., reviewing, interviewing, rejected).
- **Acceptance criteria**:
  - Status changes persist to the application record.
  - Candidate-facing status reflects changes (where appropriate).

### FR-035 — AI matching for applicants
- **Status**: **Done**
- **Description**: Recruiters shall be able to run AI matching/scoring for applicants to a job.
- **Acceptance criteria**:
  - Running matching produces scores and stores them on the application (`ai_match_score`, details).

### FR-036 — Talent pool management
- **Status**: **Done**
- **Description**: Recruiters shall be able to view/search a pool of candidates within the org scope.
- **Acceptance criteria**:
  - Recruiter can list candidates in the org talent pool and filter/search.

### FR-037 — Talent search / sourcing integrations
- **Status**: **Partially Done → To Be Done (real external integrations)**
- **Description**: Recruiters shall be able to search/surface candidates (internal and potentially external sources).
- **Acceptance criteria**:
  - Internal search works for org-scoped candidates.
  - **To be done**: production-grade external job-board/resume-database integrations (auth, rate limits, compliance).

### FR-038 — Outreach campaigns & sequencing
- **Status**: **Partially Done → To Be Done (delivery/automation maturity)**
- **Description**: Recruiters shall be able to create outreach campaigns, manage recipients, and run email sequences.
- **Acceptance criteria**:
  - Campaign and sequences can be created/managed in UI and stored.
  - **To be done**: automated scheduled sending, reply tracking, and deliverability-hardening.

### FR-039 — Email templates
- **Status**: **Done**
- **Description**: Recruiters shall be able to create/manage reusable email templates by category.
- **Acceptance criteria**:
  - Templates can be created, edited, and listed per organization.

### FR-040 — AI recruiting agents (“autopilot” sourcing)
- **Status**: **Partially Done → To Be Done (production readiness)**
- **Description**: Recruiters shall be able to configure and run AI agents that recommend candidates based on criteria.
- **Acceptance criteria**:
  - Agents can be created/toggled and produce recommendations.
  - **To be done**: continuous scheduling, guardrails, cost controls, and quality evaluation.

### FR-041 — Talent insights (analytics on talent pool)
- **Status**: **Done**
- **Description**: Recruiters shall be able to generate insights (skills distribution, etc.) over talent pool and optional job context.
- **Acceptance criteria**:
  - Insights can be generated via AI function and displayed.

---

## 5) Account Manager portal (team lead)

### FR-050 — Recruiter team management (invite-only)
- **Status**: **Done**
- **Description**: Account Managers shall be able to invite recruiters in their org and remove recruiters from org access.
- **Acceptance criteria**:
  - Manager can send recruiter invite.
  - Manager can revoke recruiter access (role removal).

### FR-051 — Manager dashboards (jobs/analytics/org)
- **Status**: **Done** (some pages may be sparse)
- **Description**: Account Managers shall have access to org dashboards and views for jobs, analytics, organization, and audit logs.
- **Acceptance criteria**:
  - Pages load with correct org scoping.
  - If org not assigned, UI shows a safe “no org assigned” state.

---

## 6) Org Admin portal (tenant admin)

### FR-060 — Org Admin dashboard as control panel
- **Status**: **Done**
- **Description**: Org Admin shall have a centralized dashboard with tab-based navigation (no left sidebar).
- **Acceptance criteria**:
  - Stat cards navigate to tabs via `?tab=...`.
  - Tabs include managers, recruiters, candidates, users, audit logs.

### FR-061 — Invite Account Managers
- **Status**: **Done**
- **Description**: Org Admin shall be able to invite and revoke Account Managers in their organization.
- **Acceptance criteria**:
  - Org admin can send invites and re-invite pending invites.
  - Org admin can revoke manager access (role removal).

### FR-062 — Invite Recruiters (directly)
- **Status**: **Done**
- **Description**: Org Admin shall be able to invite recruiters in their organization (not blocked by managers).
- **Acceptance criteria**:
  - Org admin can send recruiter invites and re-invite pending invites.

### FR-063 — Tenant user directory (staff + org-linked candidates)
- **Status**: **Done**
- **Description**: Org Admin shall be able to view a tenant-scoped user directory, including staff and org-linked candidates.
- **Acceptance criteria**:
  - Searchable list with role/type indicators.

### FR-064 — Tenant audit logs (org-scoped)
- **Status**: **Done**
- **Description**: Org Admin shall be able to view audit logs for their tenant only.
- **Acceptance criteria**:
  - Default view shows last 4 hours.
  - “Load older” pagination available.
  - Search available.
  - Platform-admin actor events are excluded.

---

## 7) Platform Admin (internal ops)

### FR-070 — Platform tenant list & org admin state
- **Status**: **Done**
- **Description**: Platform Admin shall be able to view all tenants and Org Admin invite states (active/invited/none).
- **Acceptance criteria**:
  - Tenants list shows org admin status.
  - Pending org admin invites provide copy/open/re-invite actions.

### FR-071 — Platform-wide users list with tenant column
- **Status**: **Done**
- **Description**: Platform Admin shall be able to list users with tenant attribution (“Platform” for super admins).
- **Acceptance criteria**:
  - Users list includes tenant name, or “Platform” for `super_admin`.

### FR-072 — Platform-wide audit logs (scalable UX)
- **Status**: **Done**
- **Description**: Platform Admin shall be able to view audit logs with sane defaults and scaling controls.
- **Acceptance criteria**:
  - Default shows last 4 hours.
  - Load older (100) pagination.
  - Search across actor/org/action/entity/details; clearing search returns to default behavior.

### FR-073 — Platform Admin bootstrap (allowlist)
- **Status**: **Done**
- **Description**: Platform Admin accounts can be bootstrapped by email allowlist without manual SQL after resets.
- **Acceptance criteria**:
  - Allowlisted email gets `super_admin` role on creation.
  - Existing allowlisted users can be bootstrapped at sign-in if role missing.

---

## 8) Audit logging (system-wide)

### FR-080 — System-wide write audit logging
- **Status**: **Done**
- **Description**: The system shall log create/update/delete actions across core entities.
- **Acceptance criteria**:
  - Audit logs record actor, action, entity type, entity id, timestamp, and details payload.

### FR-081 — Audit logging for privileged RPCs (role changes)
- **Status**: **Done**
- **Description**: Role assignment/revocation operations shall produce explicit audit entries.
- **Acceptance criteria**:
  - Key RPCs emit audit entries.

### FR-082 — Audit log search and paging
- **Status**: **Done**
- **Description**: Audit log UIs shall support paging and search.
- **Acceptance criteria**:
  - “last 4 hours” default view
  - “load older 100”
  - search/filter behavior

---

## 9) Notifications & communications

### FR-090 — Application notifications
- **Status**: **To Be Done (confirm end-to-end behavior)**
- **Description**: Recruiters and/or candidates should receive notifications on key events (e.g., new application, status changes).
- **Acceptance criteria**:
  - Notifications are delivered reliably (in-app and/or email).
  - Notification endpoint is authenticated/authorized.

### FR-091 — Email delivery (invites + confirmations)
- **Status**: **Partially Done → To Be Done (hardening)**
- **Description**: The system shall reliably deliver transactional emails (invites, confirmations, resets).
- **Acceptance criteria**:
  - Local development has a stable mailbox viewer.
  - Production has a configured SMTP provider and is tested for deliverability.

---

## 10) Integrations, billing, and enterprise features (future)

### FR-100 — External job boards / resume databases
- **Status**: **To Be Done**
- **Description**: Support integrations (Dice/Indeed/etc.) for sourcing and/or posting, subject to compliance and credentials.
- **Acceptance criteria**:
  - Per-org credentials management and rate limiting
  - Data retention/compliance rules

### FR-101 — Calendar scheduling
- **Status**: **To Be Done**
- **Description**: Support interview scheduling with calendar integrations.
- **Acceptance criteria**:
  - Recruiter can propose times and candidate can select; calendar event created.

### FR-102 — Subscription & billing
- **Status**: **To Be Done**
- **Description**: Support subscription plans, seat management, and usage limits.
- **Acceptance criteria**:
  - Admin can view plan, seats, and billing state.

### FR-103 — Exports and compliance controls
- **Status**: **To Be Done**
- **Description**: Support exports, retention, and privacy workflows (GDPR-like delete/export).
- **Acceptance criteria**:
  - Tenant admin can export permitted data.
  - Auditable retention policies exist.

---

## 11) Traceability notes (where to verify in current code)

These are examples of where requirements map to code (not exhaustive):
- **Auth/invite-only**: `src/pages/Auth.tsx`, `src/hooks/useAuth.tsx`, `supabase/functions/send-*-invite/*`, invite acceptance RPCs in `supabase/migrations/*`
- **Candidate apply**: `src/pages/candidate/JobDetails.tsx`, `src/pages/public/PublicJobPage.tsx`
- **Recruiter jobs**: `src/pages/recruiter/CreateJob.tsx`, `src/pages/recruiter/EditJob.tsx`, `src/pages/recruiter/RecruiterJobs.tsx`
- **Applicants + status**: `src/pages/recruiter/JobApplicants.tsx`
- **AI analysis/matching**: `src/pages/candidate/AIAnalysis.tsx`, `src/pages/recruiter/AIMatching.tsx`, edge functions under `supabase/functions/*`
- **Audit logs**: `src/pages/admin/SuperAdminDashboard.tsx`, `src/pages/orgAdmin/OrgAdminDashboard.tsx`, view `audit_logs_enriched` in `supabase/migrations/*`

