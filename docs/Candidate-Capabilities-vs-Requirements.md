# Candidate Portal: Capabilities vs. Requirements

This document lists **candidate-facing capabilities** implemented in the codebase and maps them to **FUNCTIONAL-REQUIREMENTS.md** (section 3 – Candidate portal). It also calls out **gaps**: items in the requirements that are missing or partial in code, and items in code that are not yet in the requirements.

**Source:** Full scan of `src/pages/candidate/*`, `src/pages/public/PublicJobPage.tsx`, `src/components/candidate/OnboardingWizard.tsx`, `src/pages/Auth.tsx` (candidate signup), and related hooks/components.  
**Requirements reference:** `FUNCTIONAL-REQUIREMENTS.md` (FR-020 through FR-027).

---

## 1) Implemented capabilities (code scan)

| Capability | Route / entry | Requirements mapping |
|------------|----------------|------------------------|
| **Dashboard** – Greeting, suggested next step (applications / resume / profile / find jobs), recent applications list, quick actions (profile, resume analysis, job alerts) | `/candidate` – `CandidateDashboard.tsx` | Supports FR-020, FR-021, FR-025; no explicit FR for “dashboard” |
| **Profile view & edit** – Full name, phone, LinkedIn, GitHub, headline, summary, current title/company, years of experience, desired locations, desired job types, Open to relocate, Actively looking, skills (add/remove), profile completeness score & checklist | `/candidate/profile` – `CandidateProfile.tsx` | **FR-020** ✓ |
| **Resume upload** – Upload PDF/DOCX, auto-parse (parse-resume), store `parsed_content`, set primary when first upload | `/candidate/resumes` – `CandidateResumes.tsx` | **FR-021** ✓ |
| **Resume management** – List resumes, set primary, delete, download, “Use in Workspace” link; ATS score display where available | `/candidate/resumes` | **FR-021** ✓ |
| **Job search (authenticated)** – List published jobs, search/filter (query, location, experience level, job type, remote only), view job cards, link to job detail | `/candidate/jobs` – `JobSearch.tsx` | **FR-022** ✓ (RLS enforces visibility for private jobs) |
| **Job detail & apply** – View job details, select resume, optional cover letter, apply (creates application; duplicate handling), “Already applied” state | `/candidate/jobs/:id` – `JobDetails.tsx` | **FR-022**, **FR-023** ✓ |
| **Application tracking** – List applications with status, job info; tabs All / Active / Closed; link to job detail | `/candidate/applications` – `MyApplications.tsx` | **FR-025** ✓ |
| **ATS Checkpoint (AI analysis)** – Select resume + job (existing or paste JD), run analysis; match score, matched/missing skills, recommendations, summary; PDF/DOCX support; uses real extracted resume text | `/candidate/ai-analysis` – `AIAnalysis.tsx` | **FR-026** ✓ |
| **Resume Workspace** – Create/edit resume docs, pick base resume + target job (or custom JD), “Tailor” (tailor-resume edge function), save tailored version, ATS-style insights, download tailored DOCX | `/candidate/resume-workspace` – `ResumeWorkspace.tsx` | Beyond FR-026 (advanced tailoring; no separate FR) |
| **Job Alerts** – Create/edit/delete alerts; name, keywords, locations, job types, frequency; toggle active/inactive | `/candidate/job-alerts` – `JobAlerts.tsx` | **Not in requirements** (see Gaps) |
| **Engagement requests** – View request (outreach, rate confirmation, RTR, offer); respond Accept / Reject / Counter (for rate/offer); optional message; advances engagement stage | `/candidate/engagements/requests/:requestId` – `CandidateEngagementRequest.tsx` | Supports recruiter engagement workflow (FR-036B); candidate side implied |
| **Public job apply (unauthenticated)** – Public job page by org slug + job id; upload resume → parse → sign up or sign in; create profile + application; org link on apply | `/job/:orgSlug/:jobId` – `PublicJobPage.tsx` | **FR-024** ✓ |
| **Candidate signup** – Email/password signup with **marketplace opt-in** checkbox; profile creation; optional onboarding wizard | `Auth.tsx`, onboarding flow | **FR-027** ✓ (opt-in at signup) |
| **Onboarding wizard** – Basic info, experience, preferences (locations, job types, Open to relocate); writes to `candidate_profiles` | `OnboardingWizard.tsx` | Supports FR-020; no separate FR for onboarding |
| **Settings (shared)** – Notifications, theme, language via `user_settings`; no candidate-specific marketplace opt-out | `/settings` – `Settings.tsx` | See FR-027 gap below |

---

## 2) Requirements coverage (section 3 – Candidate portal)

| Requirement | Status in code | Notes |
|-------------|----------------|--------|
| **FR-020** Candidate profile management | **Done** | View/update own profile; skills add/remove; completeness score. |
| **FR-021** Resume upload & management | **Done** | Upload, primary, delete, list; select resume when applying. |
| **FR-022** Job browsing (authenticated) | **Done** | List/search/filter jobs; job detail; visibility enforced by RLS (public + private when linked). |
| **FR-023** Apply to job (authenticated) | **Done** | Apply with selected resume + optional cover letter; application record; duplicate handling. |
| **FR-024** Public job page apply (unauthenticated) | **Done** | Resume upload, parse, sign up/sign in, profile + application creation, org link. |
| **FR-025** Application tracking | **Done** | List applications with status and job info; tabs All/Active/Closed. |
| **FR-026** Candidate AI resume/job analysis | **Done** | ATS-style score, missing/matched skills, recommendations; PDF/DOCX; explainable scoring. |
| **FR-027** Candidate marketplace consent | **Done** | Opt-in at signup ✓. Recruiters see only opted-in discoverable candidates ✓. Candidate can turn off discoverability in **Settings → Privacy** (marketplace opt-out). |

---

## 3) Gaps (missing or partial)

### 3.1 In requirements but missing or partial in code

| Item | Requirement | Gap |
|------|-------------|-----|
| ~~**Marketplace opt-out (candidate)**~~ | ~~FR-027~~ “Consent can be disabled later (To Be Done: settings UI)” | No candidate-facing control to turn off discoverability. Super Admin can toggle via dashboard; candidate cannot. **Add:** Settings (or profile) option to “Allow recruiters to discover my profile” (marketplace opt-in) on/off. |

### 3.2 In code but not in requirements

| Capability | Suggestion |
|------------|------------|
| **Job Alerts** – Create/edit/delete/toggle alerts (keywords, locations, job types, frequency) | Document as a new candidate requirement (e.g. **FR-028 – Job alerts**) if product considers this in scope, or mark as “enhancement” and leave out of core FR list. |
| **Resume Workspace** – Tailor resume to JD, save tailored version, download DOCX, ATS insights in workspace | Document as **FR-026B** or an extension of FR-026 (advanced tailoring) if you want it traceable; otherwise leave as enhancement. |
| **Engagement request response** – Candidate accepts/rejects/counters (rate, RTR, offer) and advances stage | Implied by FR-036B (recruiter engagement workflow); consider adding an explicit candidate-facing line under FR-036B or a short “FR-027B – Respond to engagement requests.” |

---

## 4) Summary

- **All current candidate FRs (FR-020–FR-026, FR-024, FR-027 opt-in)** are implemented except one: **FR-027 “consent can be disabled later”** – no candidate settings UI for marketplace opt-out.
- **Candidate capabilities not yet in requirements:** Job Alerts (full CRUD), Resume Workspace tailoring, and explicit engagement-response flow; these can be added as new FRs or called out as enhancements.
- **Recommendation:** Optionally add **FR-028 (Job Alerts)** and a short line for **engagement request response** and **Resume Workspace tailoring** if you want them in the requirements doc.
