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
import { DevDebugBanner } from "@/components/DevDebugBanner";
import { AppInitGate } from "@/components/AppInitGate";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Public Pages
import PublicJobPage from "./pages/public/PublicJobPage";
import CandidatesLanding from "./pages/public/CandidatesLanding";
import RecruitersLanding from "./pages/public/RecruitersLanding";
import ManagersLanding from "./pages/public/ManagersLanding";

// Candidate Pages
import CandidateDashboard from "./pages/candidate/CandidateDashboard";
import CandidateProfile from "./pages/candidate/CandidateProfile";
import CandidateResumes from "./pages/candidate/CandidateResumes";
import ResumeWorkspace from "./pages/candidate/ResumeWorkspace";
import JobSearch from "./pages/candidate/JobSearch";
import JobDetails from "./pages/candidate/JobDetails";
import MyApplications from "./pages/candidate/MyApplications";
import AIAnalysis from "./pages/candidate/AIAnalysis";
import JobAlerts from "./pages/candidate/JobAlerts";

// Recruiter Pages
import RecruiterDashboard from "./pages/recruiter/RecruiterDashboard";
import RecruiterJobs from "./pages/recruiter/RecruiterJobs";
import CreateJob from "./pages/recruiter/CreateJob";
import EditJob from "./pages/recruiter/EditJob";
import JobApplicants from "./pages/recruiter/JobApplicants";
import RecruiterCandidates from "./pages/recruiter/RecruiterCandidates";
import AIMatching from "./pages/recruiter/AIMatching";
import TalentSearch from "./pages/recruiter/TalentSearch";
import TalentSourcing from "./pages/recruiter/TalentSourcing";
import TalentPool from "./pages/recruiter/TalentPool";
import TalentInsights from "./pages/recruiter/TalentInsights";
import AIAgents from "./pages/recruiter/AIAgents";
import OutreachCampaigns from "./pages/recruiter/OutreachCampaigns";
import Shortlists from "./pages/recruiter/Shortlists";

// Manager Pages
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerTeam from "./pages/manager/ManagerTeam";
import ManagerJobs from "./pages/manager/ManagerJobs";
import ManagerOrganization from "./pages/manager/ManagerOrganization";
import ManagerAnalytics from "./pages/manager/ManagerAnalytics";
import ManagerCandidates from "./pages/manager/ManagerCandidates";
import ClientManagement from "./pages/manager/ClientManagement";
import AuditLogs from "./pages/manager/AuditLogs";

// Super Admin Pages
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import OrgAdminDashboard from "./pages/orgAdmin/OrgAdminDashboard";

// Shared Pages
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

// Additional Recruiter Pages
import CandidatePipeline from "./pages/recruiter/CandidatePipeline";
import EmailTemplates from "./pages/recruiter/EmailTemplates";
import InterviewSchedule from "./pages/recruiter/InterviewSchedule";
import MarketplaceProfiles from "./pages/recruiter/MarketplaceProfiles";
import EngagementPipeline from "./pages/recruiter/EngagementPipeline";

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
                <DevDebugBanner />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />

                  {/* Public Landing Pages */}
                  <Route path="/candidates" element={<CandidatesLanding />} />
                  <Route path="/recruiters" element={<RecruitersLanding />} />
                  <Route path="/managers" element={<ManagersLanding />} />

                  {/* Public Job Routes */}
                  <Route path="/jobs/:orgSlug/:jobId" element={<PublicJobPage />} />

                  {/* Candidate Routes */}
                  <Route
                    path="/candidate"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <CandidateDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/profile"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <CandidateProfile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/resumes"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <CandidateResumes />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/resume-workspace"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <ResumeWorkspace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <JobSearch />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/jobs/:id"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <JobDetails />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/applications"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <MyApplications />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/job-alerts"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <JobAlerts />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/candidate/ai-analysis"
                    element={
                      <ProtectedRoute allowedRoles={["candidate"]}>
                        <AIAnalysis />
                      </ProtectedRoute>
                    }
                  />

                  {/* Recruiter Routes */}
                  <Route
                    path="/recruiter"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <RecruiterDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <RecruiterJobs />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/new"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <CreateJob />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id/edit"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <EditJob />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <RecruiterJobIdRedirect />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:id/applicants"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <JobApplicants />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/candidates"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <RecruiterCandidates />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/ai-matching"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <AIMatching />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-search"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <TalentSearch />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-sourcing"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <TalentSourcing />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/talent-pool"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <TalentPool />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/marketplace"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <MarketplaceProfiles />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/insights"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <TalentInsights />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/agents"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <AIAgents />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/outreach"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <OutreachCampaigns />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/shortlists"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <RouteErrorBoundary title="Shortlists failed to load">
                          <Shortlists />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/pipeline"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <CandidatePipeline />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/engagements"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <EngagementPipeline />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/email-templates"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <EmailTemplates />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/interviews"
                    element={
                      <ProtectedRoute allowedRoles={["recruiter"]}>
                        <InterviewSchedule />
                      </ProtectedRoute>
                    }
                  />

                  {/* Manager Routes */}
                  <Route
                    path="/manager"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager dashboard failed to load">
                          <ManagerDashboard />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/analytics"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager analytics failed to load">
                          <ManagerAnalytics />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/team"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager team failed to load">
                          <ManagerTeam />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/jobs"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager jobs failed to load">
                          <ManagerJobs />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/candidates"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager candidates failed to load">
                          <ManagerCandidates />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/organization"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager organization failed to load">
                          <ManagerOrganization />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/clients"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager clients failed to load">
                          <ClientManagement />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manager/audit-logs"
                    element={
                      <ProtectedRoute allowedRoles={["account_manager"]}>
                        <RouteErrorBoundary title="Manager audit logs failed to load">
                          <AuditLogs />
                        </RouteErrorBoundary>
                      </ProtectedRoute>
                    }
                  />

                  {/* Super Admin Routes */}
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute allowedRoles={["super_admin"]}>
                        <SuperAdminDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Org Admin Routes (tenant) */}
                  <Route
                    path="/org-admin"
                    element={
                      <ProtectedRoute allowedRoles={["org_admin"]}>
                        <OrgAdminDashboard />
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

                  <Route path="*" element={<NotFound />} />
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
