# Page width audit

All routes have been checked for consistent content width. Standard: **dashboard/app content uses `w-full max-w-[1600px] mx-auto`** (or equivalent) so content is not squeezed in the middle.

---

## Layouts (source of width)

| Layout | Content wrapper | Notes |
|--------|-----------------|--------|
| **DashboardLayout** | Inner: `max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8` | Used by Candidate, Recruiter, Account Manager. Page content then uses `w-full max-w-[1600px] mx-auto`. |
| **AdminShell** (OrgAdminLayout, SuperAdminLayout) | `mx-auto w-full max-w-[1600px]` | Used by Org Admin and Super Admin. |

---

## By route / page

### Public (no dashboard layout)
| Route | Width handling | OK? |
|-------|----------------|-----|
| `/` (Index) | `container`, `max-w-6xl` / `max-w-7xl` sections | ✓ Intentional |
| `/auth` | `container max-w-6xl` | ✓ Intentional |
| `/candidates`, `/recruiters`, `/managers` | `container`, `max-w-6xl` sections | ✓ Intentional |
| `/jobs/:orgSlug/:jobId` (PublicJobPage) | `container mx-auto px-4` | ✓ |
| `/terms`, `/privacy` | `container`, `max-w-3xl` card | ✓ |
| 404 (NotFound) | `max-w-lg` section | ✓ |

### Candidate (DashboardLayout)
| Page | Main content wrapper | OK? |
|------|----------------------|-----|
| CandidateDashboard | `max-w-[1600px] mx-auto w-full` | ✓ |
| CandidateProfile | `max-w-[1600px] mx-auto w-full` | ✓ |
| CandidateResumes | `max-w-[1600px] mx-auto w-full` | ✓ |
| ResumeWorkspace | `max-w-[1600px] mx-auto w-full` | ✓ |
| JobSearch | `max-w-[1600px] mx-auto w-full` | ✓ |
| JobDetails | `max-w-[1600px] mx-auto w-full` | ✓ |
| MyApplications | `max-w-[1600px] mx-auto w-full` | ✓ |
| JobAlerts | `max-w-[1600px] mx-auto w-full` | ✓ |
| AIAnalysis | `max-w-[1600px] mx-auto w-full` | ✓ |
| CandidateEngagementRequest | `max-w-[1600px] mx-auto w-full` | ✓ |
| CandidateHowToGuide | `max-w-[1600px] mx-auto w-full` | ✓ |

### Recruiter (DashboardLayout)
| Page | Main content wrapper | OK? |
|------|----------------------|-----|
| RecruiterDashboard | `w-full max-w-[1600px] mx-auto` | ✓ |
| RecruiterJobs | `w-full max-w-[1600px] mx-auto` | ✓ |
| CreateJob | `w-full max-w-[1600px] mx-auto` | ✓ |
| EditJob | `max-w-[1600px] mx-auto w-full` | ✓ |
| JobApplicants | `w-full max-w-[1600px] mx-auto` | ✓ |
| RecruiterCandidates | `w-full max-w-[1600px] mx-auto` | ✓ |
| AIMatching | `w-full max-w-[1600px] mx-auto` | ✓ |
| TalentSearch | `w-full max-w-[1600px] mx-auto` | ✓ |
| TalentPool | `w-full max-w-[1600px] mx-auto` | ✓ |
| MarketplaceProfiles | `max-w-[1600px] mx-auto w-full` | ✓ |
| TalentInsights | `max-w-[1600px] mx-auto w-full` | ✓ |
| AIAgents | `max-w-[1600px] mx-auto w-full` | ✓ |
| OutreachCampaigns | `max-w-[1600px] mx-auto w-full` | ✓ |
| Shortlists | `w-full max-w-[1600px] mx-auto` | ✓ |
| CandidatePipeline | `w-full max-w-[1600px] mx-auto` | ✓ |
| EngagementPipeline | `w-full max-w-[1600px] mx-auto` | ✓ |
| InterviewSchedule | `max-w-[1600px] mx-auto w-full` | ✓ |
| EmailTemplates | `max-w-[1600px] mx-auto w-full` | ✓ |
| TalentSourcing | `max-w-[1600px] mx-auto w-full` | ✓ |
| RecruiterHowToGuide | `max-w-[1600px] mx-auto w-full` | ✓ |
| CategoryLandingPage | Renders CategoryLanding; uses `w-full min-w-0` (no extra max-w; fills layout) | ✓ |

### Account Manager (DashboardLayout)
| Page | Main content wrapper | OK? |
|------|----------------------|-----|
| ManagerDashboard | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerTeam | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerRecruiterProgress | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerJobs | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerOrganization | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerAnalytics | `w-full max-w-[1600px] mx-auto` | ✓ |
| ClientManagement | `w-full max-w-[1600px] mx-auto` | ✓ |
| AuditLogs | `w-full max-w-[1600px] mx-auto` | ✓ |
| ManagerHowToGuide | `max-w-[1600px] mx-auto w-full` | ✓ |

### Super Admin (AdminShell via SuperAdminLayout)
| Page | Width | OK? |
|------|--------|-----|
| SuperAdminDashboard | AdminShell: `max-w-[1600px]` | ✓ |
| AdminProfilePage | AdminShell: `max-w-[1600px]` | ✓ |

### Org Admin (AdminShell via OrgAdminLayout)
| Page | Width | OK? |
|------|--------|-----|
| OrgAdminDashboard | AdminShell: `max-w-[1600px]` | ✓ |
| OrgAdminProfilePage | AdminShell: `max-w-[1600px]` | ✓ |

### Shared (DashboardLayout)
| Page | Main content wrapper | OK? |
|------|----------------------|-----|
| Settings | `max-w-[1600px] mx-auto w-full` | ✓ |
| Notifications | `w-full max-w-[1600px] mx-auto` (updated from `max-w-4xl` for consistency) | ✓ Fixed |

---

## Change made in this audit

- **Notifications** (`/notifications`): Wrapper updated from `max-w-4xl mx-auto` to `w-full max-w-[1600px] mx-auto` so width matches the rest of the app.

All other dashboard pages already used `w-full` with `max-w-[1600px]` (or equivalent); no further changes.
