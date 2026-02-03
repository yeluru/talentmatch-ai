import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppInitGate } from "@/components/AppInitGate";
import { Loader2 } from "lucide-react";

const RouteLoading = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin" />
  </div>
);

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<RouteLoading />}>{node}</Suspense>
);

// Lazy-loaded pages (route-level code splitting)
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Public Pages
const PublicJobPage = lazy(() => import("./pages/public/PublicJobPage"));
const CandidatesLanding = lazy(() => import("./pages/public/CandidatesLanding"));
const RecruitersLanding = lazy(() => import("./pages/public/RecruitersLanding"));
const ManagersLanding = lazy(() => import("./pages/public/ManagersLanding"));

// Candidate Pages
const CandidateDashboard = lazy(() => import("./pages/candidate/CandidateDashboard"));
const CandidateProfile = lazy(() => import("./pages/candidate/CandidateProfile"));
const CandidateResumes = lazy(() => import("./pages/candidate/CandidateResumes"));
const ResumeWorkspace = lazy(() => import("./pages/candidate/ResumeWorkspace"));
const JobSearch = lazy(() => import("./pages/candidate/JobSearch"));
const JobDetails = lazy(() => import("./pages/candidate/JobDetails"));
const MyApplications = lazy(() => import("./pages/candidate/MyApplications"));
const AIAnalysis = lazy(() => import("./pages/candidate/AIAnalysis"));
const JobAlerts = lazy(() => import("./pages/candidate/JobAlerts"));
const CandidateEngagementRequest = lazy(() => import("./pages/candidate/CandidateEngagementRequest"));
const CandidateHowToGuide = lazy(() => import("./pages/candidate/CandidateHowToGuide"));

// Recruiter Pages
const RecruiterDashboard = lazy(() => import("./pages/recruiter/RecruiterDashboard"));
const RecruiterJobs = lazy(() => import("./pages/recruiter/RecruiterJobs"));
const CreateJob = lazy(() => import("./pages/recruiter/CreateJob"));
const EditJob = lazy(() => import("./pages/recruiter/EditJob"));
const JobApplicants = lazy(() => import("./pages/recruiter/JobApplicants"));
const RecruiterCandidates = lazy(() => import("./pages/recruiter/RecruiterCandidates"));
const AIMatching = lazy(() => import("./pages/recruiter/AIMatching"));
const TalentSearch = lazy(() => import("./pages/recruiter/TalentSearch"));
const TalentSourcing = lazy(() => import("./pages/recruiter/TalentSourcing"));
const TalentPool = lazy(() => import("./pages/recruiter/TalentPool"));
const TalentInsights = lazy(() => import("./pages/recruiter/TalentInsights"));
const AIAgents = lazy(() => import("./pages/recruiter/AIAgents"));
const OutreachCampaigns = lazy(() => import("./pages/recruiter/OutreachCampaigns"));
const Shortlists = lazy(() => import("./pages/recruiter/Shortlists"));
const CandidatePipeline = lazy(() => import("./pages/recruiter/CandidatePipeline"));
const EmailTemplates = lazy(() => import("./pages/recruiter/EmailTemplates"));
const InterviewSchedule = lazy(() => import("./pages/recruiter/InterviewSchedule"));
const MarketplaceProfiles = lazy(() => import("./pages/recruiter/MarketplaceProfiles"));
const EngagementPipeline = lazy(() => import("./pages/recruiter/EngagementPipeline"));
const CategoryLandingPage = lazy(() => import("./pages/recruiter/CategoryLandingPage"));

// Manager Pages
const ManagerDashboard = lazy(() => import("./pages/manager/ManagerDashboard"));
const ManagerTeam = lazy(() => import("./pages/manager/ManagerTeam"));
const ManagerRecruiterProgress = lazy(() => import("./pages/manager/ManagerRecruiterProgress"));
const ManagerJobs = lazy(() => import("./pages/manager/ManagerJobs"));
const ManagerOrganization = lazy(() => import("./pages/manager/ManagerOrganization"));
const ManagerAnalytics = lazy(() => import("./pages/manager/ManagerAnalytics"));
const ClientManagement = lazy(() => import("./pages/manager/ClientManagement"));
const AuditLogs = lazy(() => import("./pages/manager/AuditLogs"));

// Super Admin Pages
const SuperAdminDashboard = lazy(() => import("./pages/admin/SuperAdminDashboard"));
const OrgAdminDashboard = lazy(() => import("./pages/orgAdmin/OrgAdminDashboard"));

// Shared Pages
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Critical UX: do NOT blow away in-progress form edits by refetching on tab focus.
      // Users can still manually refresh or navigate to re-trigger fetches.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function RecruiterJobIdRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/recruiter/jobs" replace />;
  return <Navigate to={`/recruiter/jobs/${id}/edit`} replace />;
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <AppInitGate>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={withSuspense(<Index />)} />
                  <Route path="/auth" element={withSuspense(<Auth />)} />
                  <Route path="/settings" element={withSuspense(<Settings />)} />
                  <Route path="/notifications" element={withSuspense(<Notifications />)} />
                  <Route path="/terms" element={withSuspense(<Terms />)} />
                  <Route path="/privacy" element={withSuspense(<Privacy />)} />

                  {/* Public Landing Pages */}
                  <Route path="/candidates" element={withSuspense(<CandidatesLanding />)} />
                  <Route path="/recruiters" element={withSuspense(<RecruitersLanding />)} />
                  <Route path="/managers" element={withSuspense(<ManagersLanding />)} />

                  {/* Public Job Routes */}
                  <Route path="/jobs/:orgSlug/:jobId" element={withSuspense(<PublicJobPage />)} />

                  {/* Candidate Routes */}
                  <Route
                    path="/candidate"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<CandidateDashboard />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/profile"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<CandidateProfile />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/resumes"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<CandidateResumes />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/resume-workspace"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<ResumeWorkspace />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<JobSearch />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/jobs/:id"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<JobDetails />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/applications"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<MyApplications />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/job-alerts"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<JobAlerts />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/ai-analysis"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<AIAnalysis />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/engagements/requests/:requestId"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<CandidateEngagementRequest />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/help"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        {withSuspense(<CandidateHowToGuide />)}
                      </ProtectedRoute>
                    }
                  />

                  {/* Recruiter Routes */}
                  <Route
                    path="/recruiter"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<RecruiterDashboard />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<RecruiterJobs />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/new"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CreateJob />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id/edit"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<EditJob />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        <RecruiterJobIdRedirect />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id/applicants"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<JobApplicants />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/candidates"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<RecruiterCandidates />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/ai-matching"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<AIMatching />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/ats-match-search"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentSearch />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-management"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-search"
                    element={<Navigate to="/recruiter/talent-management" replace />}
                  />
                  <Route
                    path="/recruiter/jobs-home"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/pipelines"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/communications"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/insights-home"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/automation-home"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CategoryLandingPage />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-search/uploads"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentSourcing />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-search/search"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentSourcing />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-search/api"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentSourcing />)}
                      </ProtectedRoute>
                    }
                  />
                  {/* Legacy route - redirect to new structure */}
                  <Route
                    path="/recruiter/talent-sourcing"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentSourcing />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-pool"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentPool />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/marketplace"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<MarketplaceProfiles />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/insights"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<TalentInsights />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/agents"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<AIAgents />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/outreach"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<OutreachCampaigns />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/shortlists"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        <RouteErrorBoundary title="Shortlists failed to load">
                          {withSuspense(<Shortlists />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/pipeline"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<CandidatePipeline />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/engagements"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<EngagementPipeline />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/email-templates"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<EmailTemplates />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/interviews"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter", "account_manager", "org_admin", "super_admin"]}>
                        {withSuspense(<InterviewSchedule />)}
                      </ProtectedRoute>
                    }
                  />

                  {/* Manager Routes */}
                  <Route
                    path="/manager"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager dashboard failed to load">
                          {withSuspense(<ManagerDashboard />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/analytics"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager analytics failed to load">
                          {withSuspense(<ManagerAnalytics />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/team"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager team failed to load">
                          {withSuspense(<ManagerTeam />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/team/recruiters/:recruiterUserId"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Recruiter progress failed to load">
                          {withSuspense(<ManagerRecruiterProgress />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager jobs failed to load">
                          {withSuspense(<ManagerJobs />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/candidates"
                    element={<Navigate to="/recruiter/talent-pool" replace />}
                  />
                  <Route
                    path="/manager/organization"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager organization failed to load">
                          {withSuspense(<ManagerOrganization />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/clients"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager clients failed to load">
                          {withSuspense(<ClientManagement />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/audit-logs"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager audit logs failed to load">
                          {withSuspense(<AuditLogs />)}
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />

                  {/* Super Admin Routes */}
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute allowedRoles={["super_admin"]}>
                        {withSuspense(<SuperAdminDashboard />)}
                      </ProtectedRoute>
                    }
                  />

                  {/* Org Admin Routes (tenant) */}
                  <Route
                    path="/org-admin"
                    element={
                      <ProtectedRoute allowedRoles={["org_admin"]}>
                        {withSuspense(<OrgAdminDashboard />)}
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/org-admin/users"
                    element={
                      <ProtectedRoute allowedRoles={["org_admin"]}>
                        <Navigate to="/org-admin?tab=users" replace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/org-admin/audit-logs"
                    element={
                      <ProtectedRoute allowedRoles={["org_admin"]}>
                        <Navigate to="/org-admin?tab=audit_logs" replace />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={withSuspense(<NotFound />)} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </AppInitGate>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
