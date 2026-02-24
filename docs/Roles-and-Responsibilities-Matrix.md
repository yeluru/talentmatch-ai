# Roles and Responsibilities — Detailed Matrix

This document explains **who does what** in the recruitment platform in plain language. It is written for recruiters and hiring teams who are not technical. Each role is described with enough detail that someone new to the system can understand exactly what the role is responsible for and whether that is already in the app today.

---

## How to read this document

### Context and terms (used throughout)

- **Organization (org)**  
  Your company or hiring unit in the system. Each organization has its own jobs, candidates, recruiters, and account managers. People in one organization cannot see another organization’s data.

- **Invite link**  
  A link sent by email so someone can join the platform. When they click the link and sign up (or sign in), they are added to your organization with the role you invited them for (e.g. Recruiter, Account Manager, Candidate). Staff (recruiters, managers, org admins) cannot sign up on their own—they must receive an invite link.

- **Job / role / JD**  
  A job posting or open position. The **JD (job description)** is the written description of the role (title, requirements, responsibilities). Creating a job in the app means posting that role so candidates can apply or so recruiters can source for it.  
  **Intended workflow:** The Account Manager (who owns the client relationship) creates the job from the client brief and **assigns it to one or more recruiters**. Those recruiters then work on filling the role (sourcing, screening, shortlisting, etc.). Today the app still allows recruiters to create jobs and own them; “AM creates job and assigns to recruiters” is the target and is not yet fully built.

- **Candidate**  
  A job seeker—someone with a profile and (usually) a resume in the system. A candidate can apply to jobs, respond to recruiter messages (e.g. rate confirmation, offer), and manage their own profile.

- **Talent pool**  
  The shared list of candidate profiles your organization has collected (from applications, uploads, or sourcing). Recruiters search and filter this pool to find people for jobs.

- **Shortlist**  
  A named list of candidates that a recruiter (or team) puts together for a specific job or purpose. For example, “Senior Engineers – Client X” might be a shortlist of people you plan to send to the client for review.

- **Pipeline**  
  A view where candidates are grouped by **stage** (e.g. Applied → Reviewing → Screening → Interview → Offered → Hired). The **Applications pipeline** tracks people who applied to your jobs. The **Engagement pipeline** tracks people you are actively reaching out to (e.g. rate confirmation, screening, offer) before or alongside application.

- **Stage**  
  Where a candidate currently sits in the process (e.g. “Screening”, “Interview”, “Offered”). Moving someone to a new stage (e.g. to “Offered”) updates their status and can trigger emails or notifications.

- **Engagement / engagement request**  
  A message or request you send to a candidate from the app (e.g. “Confirm your rate”, “We’d like to make you an offer”). The candidate gets an email with a link; they open it and can Accept, Reject, or (for rate/offer) Counter. Their response is saved and visible to the recruiter.

- **Client**  
  The hiring company or hiring manager you are filling the role for. In the workflow, “client” often means the person who gives you the job brief, interviews candidates, and approves shortlists or offers. The app has a **Client Management** area where you can store client companies and their requirements; a full “client portal” where the client logs in to give feedback or approve is not built yet.

- **Account Manager (AM)**  
  A person in your organization who oversees recruiters and client relationships. In the intended workflow they **create jobs** (from the client brief) and **assign each job to one or more recruiters**; they see team activity, review shortlists or approve offers, and manage clients. They do not have to do hands-on recruiting; if they also recruit, they can switch to the “Recruiter” role in the app to work on assigned jobs.

- **Org Admin**  
  The top-level admin for your organization. They invite and remove Account Managers and Recruiters, invite or link candidates to the org, and see everyone in the org. They are the only ones who can invite new Account Managers.

- **Platform Admin**  
  Internal support role. They create new organizations (tenants) and invite the first Org Admin for each. They can see data across all organizations for support but do not change customer hiring data from the app.

### Status legend

| Status | Meaning |
|--------|--------|
| **Done** | You can do this in the app today. |
| **Partial** | Part of it is there (e.g. you can record the info or see the data), but a full, dedicated flow (e.g. a formal approval step) is not yet in the app. |
| **To be done** | Not in the app yet; would be needed for the full workflow we want. |

---

## 1. Platform Admin (internal support)

**Who this is:** Someone on the UltraHire/internal team who sets up new customer organizations and manages who is the Org Admin for each. They can see all organizations and users for support but are not meant to change customer hiring data (jobs, applications, candidates) from the app.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Create tenant (organization) | **What it means:** Add a new customer company to the platform so they can use the product. After creating the organization, the Platform Admin sends an invite link to the person who will be that company’s Org Admin. When that person signs up via the link, they become the Org Admin for that organization and can then invite their own Account Managers and Recruiters. **In the app:** Platform Admin has a “Create tenant” action; they enter org details and the first Org Admin is set via invite. | RBAC, code | **Done** |
| Invite Org Admin | **What it means:** Send an email containing a special link to the person who will run the organization (invitee). When they click the link and complete sign-up (or sign-in if they already have an account), they are added to that organization as Org Admin. From then on, they can invite Account Managers, Recruiters, and Candidates for their org. **In the app:** Platform Admin chooses “Invite Org Admin,” enters the invitee’s email, and the system sends the invite link. | RBAC, code | **Done** |
| Revoke Org Admin | **What it means:** Take away a user’s Org Admin access for an organization. That user will no longer be able to act as Org Admin for that org (they may still have other roles). **In the app:** Platform Admin can remove the Org Admin role from a user (e.g. from the tenant or users list). | RBAC, code | **Done** |
| View all organizations and users | **What it means:** See a list of every organization on the platform and, for each, see the people in it (Org Admins, Account Managers, Recruiters, linked candidates). This is for support and monitoring only—viewing, not editing customer data. **In the app:** Platform Admin has dashboards/lists showing all tenants and users. | RBAC, code | **Done** |
| View candidates (read-only) | **What it means:** See candidate profiles and related data across the platform when needed for support. The Platform Admin cannot edit or delete candidate data from the app. **In the app:** Read-only access to candidate data. | RBAC, code | **Done** |
| Profile (name, contact) | **What it means:** Update their own display name and contact details (e.g. first name, last name, phone) so they are clearly identified in the system. **In the app:** Platform Admin has a Profile page where they can edit this information. | Code | **Done** |
| Suspend or delete users | **What it means:** Disable or permanently remove a user’s account (e.g. when someone leaves or for security). **In the app:** This is intentionally not available in the app UI; it is done through separate, controlled operations (e.g. backend/admin tools) so that accidental or misuse is avoided. | RBAC | **To be done** (by design: out of app) |

---

## 2. Org Admin (organization super admin)

**Who this is:** The main administrator for your organization. They decide who can be an Account Manager or Recruiter (by sending invite links), can invite candidates to join the org, and can see and manage everyone in the org. They are also the ones who can link or unlink candidates to the organization and add internal notes or statuses on candidates. In the intended workflow they would also approve new jobs and offers; those approval steps are not fully in the app yet.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Job creation and approval | **What it means:** Before a new job (role) goes live or is visible to candidates, an Org Admin (or Account Manager) would review and approve it. That way the organization controls what roles are published. **In the app today:** Recruiters can create and publish jobs; there is no separate “submit for approval” or “approve job” step that blocks the job from going live. So this control is **not yet** in the app. | Workflow PDF | **To be done** |
| Recruiter assignment | **What it means:** Decide which recruiters work on which roles or which Account Manager oversees which recruiters. **In the app today:** Org Admin can invite recruiters and can optionally assign recruiters to specific Account Managers (so each AM sees only their assigned recruiters in oversight views). | Workflow PDF, RBAC | **Done** |
| Offer approval | **What it means:** Before an offer is sent to a candidate, an Org Admin (or Account Manager) would approve it. Once approved, the recruiter can release the offer to the candidate. **In the app today:** Recruiters can move candidates to the “Offered” stage and send offer-type engagement requests; there is no approval step that must be completed first. | Workflow PDF | **To be done** |
| Invite Account Managers | **What it means:** Send an email with an invite link to someone who should become an Account Manager for your organization. When they open the link and sign up (or sign in), they are added as an Account Manager and can then invite recruiters, view team activity, manage clients, etc. **In the app:** Org Admin has an “Invite Account Manager” action; they enter the person’s email and the system sends the link. | RBAC, code | **Done** |
| Invite Recruiters | **What it means:** Send an email with an invite link to someone who should become a Recruiter for your organization. When they complete sign-up via the link, they can post jobs, use the talent pool, run pipelines, send engagements, and so on. **In the app:** Org Admin (or Account Manager) can invite recruiters; they enter the email and the invite link is sent. | RBAC, code | **Done** |
| Invite Candidates | **What it means:** Send an email with an invite link to a candidate (e.g. someone you know or found outside the app). When they click the link and sign up, they are added to the platform and **linked to your organization** as a candidate. After that, your recruiters can see them in the talent pool and engage with them. **In the app:** Org Admin has “Invite Candidate”; they enter email (and optionally name); the system sends the link and, when the person signs up, links them to your org. | RBAC, code | **Done** |
| Remove Account Managers or Recruiters | **What it means:** Take away a person’s access as Account Manager or Recruiter for your organization. They will no longer be able to log in and act in that role for your org. **In the app:** Org Admin can remove Account Managers and Recruiters (e.g. from the Account Managers or Recruiters tab); the UI uses actions like “Remove account manager” or “Remove recruiter.” | RBAC, code | **Done** |
| View all users in org | **What it means:** See a single list of everyone in your organization: Account Managers, Recruiters, and candidates linked to your org. This helps you see who has access and who is in the talent pool. **In the app:** Org Admin has an “All Users” (or similar) view that lists these people. | RBAC, code | **Done** |
| Assign Recruiter to Account Manager | **What it means:** Optionally say “Recruiter A and Recruiter B are overseen by Account Manager X.” Then the Account Manager’s oversight views (e.g. team, progress) can be limited to only those recruiters. **In the app:** Org Admin can assign recruiters to an Account Manager (e.g. from the Recruiters or Account Managers tab). | Code | **Done** |
| View candidates linked to org | **What it means:** See all candidates who are associated with your organization (either because they were invited by you, applied to your jobs, or were linked manually). **In the app:** Org Admin has a Candidates tab or view that shows these candidates. | RBAC, code | **Done** |
| Link or unlink candidates to org | **What it means:** Add a candidate to your organization’s pool (link) so your recruiters can see and use them, or remove that link (unlink) so they are no longer part of your org’s pool. **In the app:** Org Admin can link or unlink candidates (e.g. from the Candidates or user management area). | RBAC, code | **Done** |
| Add internal notes or status on candidates | **What it means:** Add notes or a status (e.g. “New”, “Shortlisted”, “Rejected”) on a candidate that everyone in your org can see. This keeps the team aligned without changing the candidate’s pipeline stage. **In the app:** Org Admin can add or edit notes and status on candidates in the Candidates tab. | RBAC, code | **Done** |
| View org audit logs | **What it means:** See a log of who did what in your organization (e.g. who invited whom, who changed a status). This is for compliance and troubleshooting. **In the app:** Org Admin has an Audit Logs tab that shows org-scoped activity. | RBAC, code | **Done** |
| Profile (name, phone) | **What it means:** Update their own name and phone number so they are clearly identified. **In the app:** Org Admin has a Profile page (e.g. in the sidebar) where they can edit first name, last name, and phone. | Code | **Done** |
| Organization settings | **What it means:** Change organization-wide settings (e.g. company name, branding, default options). **In the app:** The organization exists and some org data is used; a full “Organization settings” page with all options may be limited. | RBAC | **Partial** |

---

## 3. Account Manager (AM)

**Who this is:** Someone in your organization who oversees recruiters and client relationships. They do not have to do hands-on recruiting; their main job is to see how the team is doing, assign recruiters, manage clients, and (in the intended workflow) review shortlists and approve offers. If they also recruit, they can switch to the “Recruiter” role in the app to work on jobs assigned to them.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Create job and assign to recruiters | **What it means:** After the client gives you the brief (role, JD, expectations), you create the job in the app so it exists as an open requirement. You then assign that job to one or more recruiters. Those recruiters see the job in "my assigned jobs" and work on filling it (sourcing, screening, shortlisting, etc.). You can assign the same job to multiple recruiters (e.g. two recruiters sharing the pipeline) or different jobs to different recruiters to balance workload. **In the app today:** Recruiters create jobs and own them; there is no "AM creates job" or "assign this job to these recruiters" flow. So today the AM only sees what recruiters are working on; they cannot create a job and assign it. | Workflow PDF, design | **To be done** |
| Client requirement briefing | **What it means:** Sit down with the client (hiring manager) and capture the job description (JD) and expectations: what the role is, must-haves, nice-to-haves, salary range, timeline. This becomes the brief that recruiters use to source and shortlist. **In the app today:** There is a Client Management area where you can create clients and store information (including requirements). A dedicated “briefing” flow (e.g. a form that creates a job or brief from the client conversation) is not clearly separated. | Workflow PDF | **Partial** |
| Candidate shortlist review | **What it means:** Before the recruiter sends a shortlist to the client, the Account Manager reviews it (right people, right job, quality). They might approve it, ask for changes, or add notes. **In the app today:** Account Managers can view recruiters’ pipelines and shortlists (e.g. in Team or Recruiter Progress). There is no dedicated “Submit shortlist for AM review” or “Approve shortlist” step. | Workflow PDF | **Partial** |
| Offer rollout | **What it means:** After internal approval (e.g. from Org Admin or AM), the Account Manager (or recruiter) “releases” the offer so it can be sent to the candidate. **In the app today:** Recruiters can move candidates to Offered and send offer engagements; there is no “release offer” or approval gate. | Workflow PDF | **To be done** |
| Invite Recruiters | **What it means:** Send an invite link by email to someone who should become a Recruiter in your organization. When they sign up via the link, they get Recruiter access and can be assigned to you or to clients. **In the app:** Account Manager can invite recruiters (e.g. from the Team page); they enter the email and the system sends the link. | RBAC, code | **Done** |
| Remove Recruiters | **What it means:** Remove a person’s Recruiter access for your organization so they can no longer log in as a recruiter. **In the app:** Account Manager can remove recruiters (e.g. from the Team view). | RBAC, code | **Done** |
| Be assigned recruiters | **What it means:** Org Admin (or equivalent) can assign specific recruiters to you. Then your oversight views (team, progress) show only those recruiters instead of everyone in the org. **In the app:** The system supports “assign recruiter to Account Manager”; when set, the AM sees only their assigned recruiters in Team and progress views. | Code | **Done** |
| View team (recruiters and AMs) | **What it means:** See a list of recruiters and (if any) other Account Managers in your organization. **In the app:** Manager Team page shows the team; if assignments are used, you see only your assigned recruiters. | RBAC, code | **Done** |
| View recruiter progress | **What it means:** See how each recruiter is doing: how many applications they have, which stage candidates are in, recent activity. You can drill into one recruiter to see their pipeline and metrics. **In the app:** Manager Recruiter Progress (and related views) show applications, stages, and activity per recruiter. | Code | **Done** |
| View org jobs overview | **What it means:** See all jobs in your organization—who owns them, status, how many applicants—without having to log in as a recruiter. **In the app:** Manager Jobs (or Jobs Overview) lists all org jobs with ownership and status. | RBAC, code | **Done** |
| View analytics | **What it means:** See charts and numbers on hiring: how many applications, where they are in the pipeline, team performance over time. **In the app:** Manager Analytics shows funnel, applications, and team metrics. | Code | **Done** |
| Manage clients | **What it means:** Add and edit client companies (the hiring companies you fill roles for). Store their name, contact, and requirements so recruiters know who they are filling the role for. **In the app:** Client Management lets you create and edit clients and their details. | Code | **Done** |
| View audit logs | **What it means:** See a log of actions in your organization (who did what, when) for compliance and troubleshooting. **In the app:** Manager Audit Logs shows org-scoped audit entries. | Code | **Done** |
| Switch to Recruiter role | **What it means:** If you are both an Account Manager and a Recruiter, you can switch to “Recruiter” in the app to do hands-on work: post jobs, use the talent pool, run pipelines, send engagements. When you switch back to “Account Manager,” you see oversight again. **In the app:** The header has a role switcher; there is also an “Also do recruiting? Switch to Recruiter” prompt on the Manager Dashboard. | Code | **Done** |
| View organization | **What it means:** See your organization’s name and basic settings. **In the app:** Manager Organization page shows org info. | Code | **Done** |

---

## 4. Recruiter

**Who this is:** The person who does the day-to-day recruiting: finds candidates (talent pool, marketplace, sourcing), screens them, builds shortlists, coordinates interviews, sends offers, and tracks candidates through the pipeline. In the **intended workflow** they work on **jobs assigned to them by the Account Manager** (AM creates the job from the client brief and assigns it to one or more recruiters). They work within their organization only and cannot manage other users’ roles.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Work on jobs assigned by AM | **What it means:** The Account Manager creates a job (from the client brief) and assigns it to you (and possibly other recruiters). You see it in "My jobs" or "Assigned to me" and you run the full flow: source candidates, screen, shortlist, coordinate interviews, send offers. If the job is assigned to more than one recruiter, you and the others share the same job and pipeline. **In the app today:** There is no "assigned to me" model yet. Jobs are created and owned by the recruiter who creates them; the AM only sees what recruiters are doing. So this "AM creates, assigns to recruiters" flow is **to be done**. | Workflow PDF, design | **To be done** |
| Create jobs (post a role) — current | **What it means:** Add a new job to the system: job title, job description (JD), location, requirements, and whether the job is visible to all candidates (public) or only to candidates linked to your org (private). Once created and published, candidates can apply and you can source for it. **In the app today:** Recruiters do this today via Create Job and Edit Job. In the intended workflow, the AM would create the job and assign it to you; until that is built, recruiter-created jobs remain the norm. | Workflow PDF, code | **Done** (current); **intended:** AM creates, recruiter works on assigned |
| Capture job requirements (requirement intake) | **What it means:** Record what the role needs: skills, experience, education, and any other must-haves or nice-to-haves. This is part of creating or editing the job (whether you create it or the AM creates it and assigns to you). **In the app:** The job creation/edit form includes fields for requirements and description. | Workflow PDF, code | **Done** |
| Search the talent pool | **What it means:** Search and filter the organization’s talent pool (candidates who have applied, been uploaded, or been invited) to find people who match a job. **In the app:** Talent Pool, Talent Search, and ATS Match Search let you search and filter by skills, experience, etc. | Workflow PDF, code | **Done** |
| Browse marketplace profiles | **What it means:** See candidates who have chosen to be “discoverable” to employers. These are people who may not have applied to your job yet but have made their profile visible so recruiters can find and reach out to them. **In the app:** Marketplace Profiles shows these candidates; you can view and add them to shortlists or start engagements. | Code | **Done** |
| Bulk upload or import candidates | **What it means:** Add many candidates at once (e.g. from a spreadsheet or CSV) instead of one by one. **In the app:** Talent Sourcing and bulk import flows let you upload files or import candidates so they appear in the talent pool. | Code | **Done** |
| Send outreach and engagement emails | **What it means:** Send emails to candidates from the app—for example to confirm rate, share a job, or send an offer. The candidate gets an email with a link; when they open it, they can respond (Accept, Reject, Counter), and you see the response in the app. **In the app:** Engagement Pipeline and the “send engagement” actions let you choose the type (e.g. rate confirmation, offer), edit the message, and send; the system sends the email and records the response. | Workflow PDF, code | **Done** |
| Screen profile and resume | **What it means:** Read the candidate’s profile and resume, decide if they are a fit, and record your decision (e.g. move to “Screening” or “Rejected”) and any notes. **In the app:** In the applicant or candidate detail view you can change status, add notes, and move them between pipeline stages. | Workflow PDF, code | **Done** |
| Record pre-screen call | **What it means:** After a phone or video screening call, update the candidate’s stage and add notes (e.g. “Spoke 15 min, interested, available in 2 weeks”). **In the app:** You can set status and add notes; there is no separate “log a call” form, but notes and stage serve this purpose. | Workflow PDF, code | **Partial** |
| Create and manage shortlists | **What it means:** Create named lists of candidates (e.g. “Backend Engineers – Client A”) and add or remove people. You use shortlists to keep track of who you plan to send to the client or to the next stage. **In the app:** Shortlists page lets you create shortlists, add candidates from the talent pool or applicants, and manage them. | Workflow PDF, code | **Done** |
| Submit shortlist to client (for review) | **What it means:** Formally send a shortlist to the client (hiring manager) so they can review and give feedback. **In the app:** Clients exist in Client Management, but there is no dedicated “Submit this shortlist to client” action or client portal where the client logs in to review. This is usually done outside the app today. | Workflow PDF | **To be done** |
| Coordinate interview scheduling | **What it means:** Find a time that works for the candidate and the client, send calendar invites or confirmations, and record when the interview is scheduled. **In the app:** Interview Schedule (or similar) helps you coordinate and see upcoming interviews. | Workflow PDF, code | **Done** |
| Share feedback with candidate | **What it means:** After an interview (or any stage), update the candidate with feedback—e.g. “Client liked you, next round next week” or “We’re going in another direction”—and record it in the app so the team can see it. **In the app:** You can add notes and change status on the candidate/applicant; the candidate may be notified depending on how you use the system. | Workflow PDF, code | **Done** |
| Move candidate to offer and send offer request | **What it means:** When the client is ready to make an offer, you move the candidate to the “Offered” stage and send them an offer (e.g. via an engagement request). The candidate opens the link and can Accept, Reject, or Counter. **In the app:** You can set the application stage to Offered and send an “offer” engagement; the candidate sees it on the engagement request page and can respond. | Workflow PDF, code | **Done** |
| Track joining and onboarding | **What it means:** After the candidate accepts, track that they are joining (start date, documents, etc.) until they are fully onboarded. **In the app:** There is an “onboarding” stage in the engagement pipeline and you can use status and notes; a dedicated “joining checklist” or onboarding workflow is not fully built. | Workflow PDF, code | **Partial** |
| Mark closure and use reporting | **What it means:** When the role is filled or closed, mark it closed and use reports to see how many hires, time-to-fill, etc. **In the app:** You can mark candidates as Hired and jobs as closed; analytics and reporting exist. A single “closure” workflow (e.g. one button that closes the role and updates all) is not fully standardized. | Workflow PDF, code | **Partial** |
| Run AI matching | **What it means:** Use the system’s AI to rank or suggest candidates for a job based on the job description and candidate profiles. **In the app:** AI Matching lets you run matching for a job and see scored or ranked candidates. | Code | **Done** |
| Use Applications and Engagement pipelines | **What it means:** See candidates in columns by stage (Applied, Reviewing, Screening, Interview, Offered, Hired, etc.) and drag-and-drop or click to move them. The Applications pipeline is for people who applied to your jobs; the Engagement pipeline is for people you are actively engaging (rate, screening, offer, onboarding). **In the app:** Candidate Pipeline (applications) and Engagement Pipeline (engagements) provide these views. | Code | **Done** |
| Use email templates | **What it means:** Save reusable email text (e.g. for screening invite, offer) so you don’t type the same thing every time. **In the app:** Email Templates lets you create and use templates when sending emails. | Code | **Done** |
| View talent insights | **What it means:** See data and insights about your talent pool and hiring (e.g. where candidates come from, pipeline conversion). **In the app:** Talent Insights shows these analytics. | Code | **Done** |
| Use Search Agents | **What it means:** Set up and run automated search agents that continuously monitor your talent pool for candidates matching specific job criteria. **In the app:** Search Agents page lets you create job-specific agents and run them to get recommendations. | Code | **Done** |

---

## 5. Candidate (job seeker)

**Who this is:** A person looking for a job. They have a profile and resume in the system, can search and apply for jobs, and respond to recruiter messages (e.g. rate confirmation, offer). They can only see and edit their own data. Candidates are the only role that can sign up on their own; everyone else needs an invite link.

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Apply to jobs | **What it means:** Find a job they want, click Apply, and submit their profile and (usually) a chosen resume. The application is saved and the recruiter sees them in the Applications pipeline. **In the app:** Job Search and Job Details let them browse and apply; My Applications shows their applications and status. | Workflow PDF, code | **Done** |
| Manage profile | **What it means:** Update their own profile: name, contact, skills, work experience, education, and any other information recruiters see. **In the app:** Candidate Profile (or My Profile) lets them edit this. | RBAC, code | **Done** |
| Upload and manage resumes | **What it means:** Upload one or more resumes (e.g. PDF), name them, and choose which resume to use when applying to a job. **In the app:** My Resumes (or Candidate Resumes) lets them upload, view, and select a resume for applications. | RBAC, code | **Done** |
| Confirm or decline interview | **What it means:** When the recruiter sends an interview invite or schedule, the candidate confirms they can make it or declines. **In the app:** Interview scheduling exists; the exact “confirm schedule” step may be via link or email; full in-app confirmation flow may be partial. | Workflow PDF, code | **Partial** |
| Accept, decline, or counter an offer | **What it means:** When the recruiter sends an offer (via the app), the candidate opens the link and chooses Accept, Reject, or Counter (e.g. with a different salary or start date). Their response is saved and the recruiter sees it. **In the app:** When the candidate opens the engagement request link (from email), they see the offer and can Accept, Reject, or Counter and add a message. | Workflow PDF, code | **Done** |
| Respond to rate confirmation | **What it means:** When the recruiter asks them to confirm their rate (e.g. salary expectation or hourly rate), the candidate opens the link and Accepts, Rejects, or Counters. **In the app:** Same engagement request page; for “rate confirmation” type they can respond the same way. | Code | **Done** |
| Search and browse jobs | **What it means:** Search or filter jobs and open a job to read the full description and apply. They see jobs that are either public (all candidates) or visible to their organization. **In the app:** Job Search and Job Details; visibility rules (public vs org-only) are applied. | Code | **Done** |
| Get job alerts | **What it means:** Get an email when new jobs that match their preferences are posted. **In the app:** Job Alerts lets them set preferences and receive notifications. | Code | **Done** |
| Get AI resume feedback | **What it means:** Use the system’s AI to get feedback on their resume (e.g. how well it matches a job or general tips). **In the app:** ATS Checkpoint (or AI Analysis) provides this. | Code | **Done** |
| Tailor resume to a job | **What it means:** Use a tool to adapt their resume to a specific job description and then download or use it for the application. **In the app:** Resume Workspace lets them tailor and export. | Code | **Done** |
| Open engagement link and respond | **What it means:** When a recruiter sends them an email (e.g. rate confirmation, offer), the email contains a link. When they open the link, they see the full message and can respond (Accept, Reject, Counter, with optional message). **In the app:** Candidate Engagement Request page is where they land when they click the link; they see the request type and can respond. | Code | **Done** |
| Sign up without an invite (self-signup) | **What it means:** Candidates can create an account on their own by entering email and password (and any required profile info). They do not need an invite link. Recruiters, Account Managers, and Org Admins **do** need an invite. **In the app:** Auth page has Sign Up for candidates; staff roles are only assigned via invite. | RBAC, code | **Done** |
| Join org via invite from Org Admin | **What it means:** If an Org Admin sends them an invite link, they can click it and sign up (or sign in). Once they do, they are **linked to that organization** so the org’s recruiters can see them in the talent pool and contact them. **In the app:** Org Admin uses “Invite Candidate”; the candidate receives the link and, after sign-up, is linked to the org automatically. | RBAC, code | **Done** |

---

## 6. System (automation in the background)

**Who this is:** Not a person—these are things the system does automatically (e.g. when you move a candidate to a stage or send an engagement, the system updates records and may send emails).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Update candidate status and notify | **What it means:** When a recruiter (or the process) moves a candidate to a new stage or sends an engagement, the system updates the candidate’s status and can send an email to the candidate (e.g. “Your application has been updated” or “You have a new offer to review”). **In the app:** Status changes and engagement sends trigger updates and (where configured) emails. | Workflow PDF, code | **Done** |
| Closure and reporting | **What it means:** When a role is filled or closed, the system can mark closure and feed data into reports and analytics. **In the app:** Analytics and reporting exist; “closure” as one standardized event that drives all reports may be partial. | Workflow PDF, code | **Partial** |
| Send emails (invites, engagements, notifications) | **What it means:** The system sends the actual emails: invite links, engagement requests (rate, offer), and application or status notifications. **In the app:** Invite and engagement flows use the configured email provider (e.g. Resend) to send these. | Code | **Done** |
| Parse resumes and match candidates (AI) | **What it means:** When a resume is uploaded or a job is created, the system can extract text from the resume, understand the job description, and run matching so recruiters see scored or ranked candidates. **In the app:** Resume parsing, job parsing, and AI matching run via backend/Edge Functions. | Code | **Done** |

---

## 7. Client (hiring manager / external)

**Who this is:** The person or company you are filling the role for (the “client”). In the workflow they give you the brief, interview candidates, and approve shortlists or offers. In the app they are represented as “clients” in Client Management, but they do **not** currently log in as a separate role; feedback and approvals are either done outside the app or are to be built (e.g. client portal).

| Responsibility | Detail | Source | Status |
|----------------|--------|--------|--------|
| Give interview feedback | **What it means:** After interviewing a candidate, the client shares feedback (e.g. “Strong yes for next round” or “Not a fit”) so the recruiter can update the candidate and pipeline. **In the app:** There is no client login or portal; feedback is typically collected offline (email, call) and the recruiter updates the app. A future “client portal” could let the client log in and submit feedback. | Workflow PDF | **To be done** |
| Define or use assessment types | **What it means:** Specify what kind of assessments or evaluations are used for the role (e.g. technical test, case study). **In the app:** No structured “assessment types” or assessment workflow yet. | Workflow PDF | **To be done** |
| Approve shortlist or offer | **What it means:** The client formally approves a shortlist (so recruiters can move to interview) or approves an offer (so it can be sent to the candidate). **In the app:** No approval step in the app today; Org Admin/AM “offer approval” and “shortlist review” are also not yet implemented as gates. | Workflow PDF | **To be done** |

---

## Summary by status

| Status | What it means |
|--------|----------------|
| **Done** | Most of the day-to-day work is in the app: invites (all roles and candidates), pipelines, shortlists, engagements, applications, offer and rate responses, Account Manager oversight, Org Admin user and candidate management, and recruiter execution (jobs, talent pool, sourcing, screening, interviews, offers). **Intended (to be done):** AM creates jobs and assigns them to one or more recruiters; recruiters work on "assigned jobs" instead of only creating jobs themselves. |
| **Partial** | Some pieces are there but not the full flow: e.g. job/offer approval gates, formal shortlist review by AM, client submission, joining/onboarding checklist, closure workflow, org settings. |
| **To be done** | Not in the app yet: formal job and offer approval (Org Admin/AM), client portal (interview feedback, approval layers), assessment types. User suspend/delete is intentionally left out of the app and done via other tools. |

---

*This document is based on Recruitment Work Flow Chart.pdf, RBAC-for-Product.txt, and the current app. It is written for non-technical readers and is updated to reflect roles and implementation status.*
