# TalentMatch AI — System Requirements & Scope (Guiding README)

This document is the **single source of truth** for *what the system does* and *what it must do*, independent of implementation details.

It is written so you can:
- Run and evolve the **current architecture** (React + Supabase).
- Later **start over** with a different architecture (e.g., React frontend + Node.js APIs + NoSQL) while preserving the same product requirements.

Also see:
- `docs/RBAC-for-Product.txt` (product-friendly RBAC)
- `README.md` (developer setup + deployment)

---

## Product scope (what this system is)

TalentMatch AI is a **multi-tenant recruitment platform** where:
- **Candidates** can self-sign up and apply for jobs.
- **Staff users** (Org Admin, Account Manager, Recruiter) are **invite-only**.
- Each **tenant** is an **organization**. Tenants must be **hard-isolated** from each other.
- The platform has an internal **Platform Admin** role for operations/support across tenants.

---

## Core invariants (must never break)

- **Tenant isolation**: a tenant must never access another tenant’s private data.
- **Least privilege**: users can only do what their role allows.
- **Invite-only staff onboarding**: staff cannot create accounts via public signup paths.
- **Auditability**: all meaningful write actions are traceable (who/what/when/where).
- **Safe internal admin**: platform admin can troubleshoot broadly, but destructive actions are tightly controlled.

---

## Actors & roles

### Candidate (`candidate`) — self-signup allowed
- Own profile/resume/applications.
- May be “public” (not org-linked) or org-linked depending on product workflow.

### Recruiter (`recruiter`) — invite-only
- Hiring workflows inside their organization (jobs, applications, candidate review).
- No user/role management.

### Account Manager (`account_manager`) — invite-only
- Team oversight within their organization.
- Can invite/revoke recruiters (within org).

### Org Admin (`org_admin`) — invite-only
- Admin for a single tenant.
- Can invite/revoke account managers and recruiters.
- Can view org-scoped audit logs (excluding platform-admin actor events).

### Platform Admin (`super_admin`) — internal
- Tenant provisioning and Org Admin lifecycle.
- Global read-only visibility across tenants for troubleshooting + audit logs.
- Destructive actions (delete/suspend) are intentionally *not* part of normal UI flows.

---

## User lifecycle & onboarding flows

### 1) Candidate signup
- Candidate signs up via `/auth`.
- Email confirmation required (product/security).
- After confirmation + sign-in, candidate lands in candidate experience.

### 2) Staff onboarding (invite-only)
Invite link flow is consistent across Org Admin / Account Manager / Recruiter:
- Admin creates invite record → user receives invite link → user signs up → confirms email → signs in → invite is claimed (server-side) and role is assigned.

Invite chains:
- Platform Admin → invites Org Admin (tenant creation + invite, or invite existing tenant)
- Org Admin → invites Account Manager
- Org Admin and/or Account Manager → invites Recruiter

### 3) Revoke / re-invite
- Admin can revoke staff role access.
- Admin can re-invite pending or revoked users via “Re-invite” actions.
- Requirement: revocation must take effect immediately (no “stale session” accidental access).

---

## Platform Admin (“Super Admin”) capabilities

### Tenant provisioning
- Create tenant (organization).
- Invite Org Admin for a new tenant.
- Invite Org Admin for an existing tenant.

### Global read-only troubleshooting
Platform Admin can view (read-only):
- Organizations
- Profiles/users
- Roles
- Audit logs (platform-wide)
- Optionally read-only cross-tenant views of hiring entities (jobs/candidates/applications) for troubleshooting

### Hard boundaries
- No “bulk delete users” or similar destructive admin endpoints exposed as callable functions.
- Org Admin lifecycle is the primary write surface for platform admin.

---

## Org Admin dashboard (tenant-scoped control panel)

The Org Admin experience is intended to be a **central control panel** for the tenant:
- No left sidebar navigation (Super-Admin-like layout).
- Clickable stat cards that route via `?tab=...` to:
  - Account Managers
  - Recruiters
  - Candidates
  - All Users
  - Audit Logs
- Org audit logs must be **tenant-scoped** and must **filter out platform-admin actor activity**.

---

## Audit logging requirements

### Goals
- Provide trustworthy history for security, troubleshooting, and compliance.
- Make it easy to answer: “Who changed what, when, and why?”

### Minimum requirements
- All **write operations** (create/update/delete) are audit logged.
- Important RPCs are explicitly audit logged (especially role changes/revocations).
- Audit logs must support:
  - “last 4 hours” default view
  - paging (“load older 100”)
  - search (full-text over actor/action/target/details)

### Tenant vs platform audit visibility
- Platform admin sees **platform-wide** audit logs.
- Org admin sees **org-only** audit logs and should not see platform admin actor events.

---

## Security requirements (implementation-agnostic)

### API authentication/authorization
All non-public endpoints must:
- Require authentication.
- Enforce role checks.
- Enforce tenant scoping.

### “Dangerous admin endpoints”
Do not ship callable endpoints that can:
- bulk delete users
- arbitrary profile upsert
- “super admin find user” style functions that bypass intended controls

If these capabilities are needed operationally, they must be gated behind controlled ops, additional secrets, or runbook-only procedures.

### Data-layer enforcement
Regardless of backend choice, you need a **single source of authorization truth**. In the current implementation this is primarily:
- Postgres Row Level Security (RLS) policies
- Security-definer RPCs for privileged operations
- JWT-verified edge functions for sensitive actions

If you rebuild with Node.js + NoSQL, you must implement equivalent controls in your API/service layer, with strong automated tests.

---

## Current implementation mapping (so you can re-implement later)

### Frontend
- React + Vite SPA, role-aware routing and dashboards.
- Routes are guarded by role checks in the client, but **the backend remains the source of truth**.

### Backend (current)
- Supabase Auth (email/password + confirmation)
- Postgres + RLS (tenant isolation + role enforcement)
- Supabase Edge Functions (invites, bootstrap, notifications, AI helpers)
- Database triggers + views for system-wide audit logging

### Backend (future option)
If you restart with React + Node.js APIs + NoSQL:
- Keep the **same roles and flows**.
- Replace RLS with:
  - API-layer authorization middleware (role + tenant scoping)
  - audit log writer at the service boundary
  - background job system (queues) where needed
- Preserve the same “invite-only staff” lifecycle and re-invite mechanics.

---

## Done (implemented in the current codebase)

### RBAC + routing
- Invite-only enforcement for staff roles (Org Admin / Account Manager / Recruiter).
- Role-based routing redirects and protected routes aligned with `docs/RBAC-for-Product.txt`.
- Org Admin has a dedicated dashboard layout and tab-based navigation.

### Platform Admin global read-only + audit UX
- Platform Admin can view platform-wide audit logs with:
  - default **last 4 hours**
  - “load older (100)” pagination
  - search behavior that returns to normal when cleared
- Users list includes a **Tenant** column (Platform / org / public).

### Security hardening
- Critical edge functions require JWT (`verify_jwt = true`), including `notify-application` and invite functions.
- Dangerous admin edge functions were removed/locked down (stubs returning “gone”) to prevent accidental misuse.
- Prevented self-escalation: removed policy that allowed users to insert their own roles.

### Platform Admin bootstrap (no manual SQL after reset)
- Platform admin allowlist (`platform_admin_allowlist`) supports email-based bootstrap.
- New users are assigned `super_admin` at creation if allowlisted.
- Existing users can be bootstrapped on login (allowlist-based) via `bootstrap-platform-admin`.

### System-wide audit logging
- Audit logs capture write operations via generic triggers on core tables.
- Enriched audit view supports search and includes actor/org info.
- Org Admin audit logs are tenant-scoped and filter out platform-admin actor events.

---

## To Be Done (explicit backlog / requirements gaps)

These are either product decisions or implementation items you may still want to complete or re-verify.

### Email confirmation reliability (local + prod)
- Confirm local SMTP config is explicitly wired (Mailpit SMTP is typically `1025`) and documented end-to-end.
- Confirm production SMTP (e.g., Resend) is configured and tested for deliverability.

### Compliance + privacy
- Confirm legal stance for platform-wide read-only visibility (and document: purpose, retention, access controls).
- Add/confirm audit log retention policy (time-based retention + export policy).

### Candidate org-admin fields behavior
- Re-verify candidate admin fields can be cleared to `NULL` (avoid `COALESCE` patterns that block “clear” actions).

### Operational hardening
- Add automated tests for RBAC invariants (roles, tenant scoping, invite acceptance, revocation).
- Add rate limiting / abuse controls on public endpoints (auth, application submission, etc.) as needed.

---

## Interfaces you must preserve (for a Node/NoSQL rewrite)

If you rebuild, keep these external behaviors stable:
- **Auth**: email confirmation + password reset
- **Invite links**: single-use / expiring invites for staff onboarding
- **Role assignment**: only via privileged server-side operations (never from client writes)
- **Tenant scoping**: every staff action must be scoped to the actor’s organization
- **Audit logs**: every meaningful write must emit an audit record with actor + tenant + target + details

---

## Glossary
- **Tenant**: an organization/customer account.
- **Actor**: the user performing an action (for audit logs).
- **Invite-only**: users cannot self-register for staff roles; they must accept an admin invite.
