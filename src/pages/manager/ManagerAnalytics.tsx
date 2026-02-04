import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Briefcase,
  Users,
  TrendingUp,
  BarChart3,
  ArrowRight,
  UserCircle,
  AlertCircle,
  Target,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const PIPELINE_ORDER = ['applied', 'reviewing', 'screening', 'interview', 'offer', 'hired'];

interface RecruiterRow {
  user_id: string;
  full_name: string;
  job_count: number;
  applications_count: number;
  applications_last_30_days: number;
  in_pipeline: number; // screening + interview + offer
  hired: number;
  candidates_added: number;
}

interface JobHealthRow {
  id: string;
  title: string;
  applications_count: number;
  updated_at: string;
  recruiter_name?: string;
}

export default function ManagerAnalytics() {
  const { organizationId, currentRole, user, isLoading: authLoading } = useAuth();
  const [openJobs, setOpenJobs] = useState(0);
  const [totalApplications, setTotalApplications] = useState(0);
  const [applicationsLast30, setApplicationsLast30] = useState(0);
  const [applicationsPrev30, setApplicationsPrev30] = useState(0);
  const [applicationsByStatus, setApplicationsByStatus] = useState<{ status: string; count: number }[]>([]);
  const [recruiterRows, setRecruiterRows] = useState<RecruiterRow[]>([]);
  const [jobHealth, setJobHealth] = useState<JobHealthRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchAnalytics();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

  const fetchAnalytics = async () => {
    if (!organizationId) return;

    try {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, recruiter_id, title, updated_at, applications_count')
        .eq('organization_id', organizationId);

      const jobIds = jobs?.map((j) => j.id) || [];
      const openJobsCount = jobs?.filter((j) => j.status === 'published').length || 0;
      setOpenJobs(openJobsCount);

      // AM scope: only assigned recruiters
      let recruiterIdsInScope: Set<string> = new Set();
      if (currentRole === 'account_manager' && user?.id) {
        const { data: assigned } = await supabase
          .from('account_manager_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('organization_id', organizationId)
          .eq('account_manager_user_id', user.id);
        recruiterIdsInScope = new Set((assigned || []).map((a: { recruiter_user_id: string }) => a.recruiter_user_id));
      } else {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('organization_id', organizationId)
          .eq('role', 'recruiter');
        recruiterIdsInScope = new Set((rolesData || []).map((r: { user_id: string }) => r.user_id));
      }

      const recruiterIds = Array.from(recruiterIdsInScope);

      // Applications: total, last 30d, previous 30d, by status
      let totalApps = 0;
      const statusCounts: Record<string, number> = {};
      let appsLast30 = 0;
      let appsPrev30 = 0;

      if (jobIds.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const { data: applications } = await supabase
          .from('applications')
          .select('id, status, applied_at, job_id')
          .in('job_id', jobIds);

        totalApps = applications?.length || 0;
        applications?.forEach((app: { status?: string; applied_at?: string; job_id: string }) => {
          const s = app.status || 'applied';
          statusCounts[s] = (statusCounts[s] || 0) + 1;
          const at = app.applied_at ? new Date(app.applied_at).getTime() : 0;
          if (at >= thirtyDaysAgo.getTime()) appsLast30++;
          if (at >= sixtyDaysAgo.getTime() && at < thirtyDaysAgo.getTime()) appsPrev30++;
        });
      }

      setTotalApplications(totalApps);
      setApplicationsLast30(appsLast30);
      setApplicationsPrev30(appsPrev30);
      setApplicationsByStatus(
        PIPELINE_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => ({ status: s, count: statusCounts[s] || 0 }))
      );

      // Per-recruiter performance
      const jobIdToRecruiter: Record<string, string> = {};
      (jobs || []).forEach((j: { id: string; recruiter_id?: string }) => {
        if (j.recruiter_id) jobIdToRecruiter[j.id] = j.recruiter_id;
      });

      let appRows: { job_id: string; status: string; applied_at: string }[] = [];
      if (jobIds.length > 0) {
        const { data: appList } = await supabase
          .from('applications')
          .select('job_id, status, applied_at')
          .in('job_id', jobIds);
        appRows = (appList || []) as { job_id: string; status: string; applied_at: string }[];
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recruiterTable: RecruiterRow[] = [];
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', recruiterIds);

      for (const recId of recruiterIds) {
        const recJobIds = (jobs || []).filter((j: { recruiter_id?: string }) => j.recruiter_id === recId).map((j: { id: string }) => j.id);
        const recApps = appRows.filter((a) => recJobIds.includes(a.job_id));
        const appsLast30Rec = recApps.filter((a) => new Date(a.applied_at) >= thirtyDaysAgo).length;
        const inPipeline = recApps.filter((a) => ['screening', 'reviewing', 'interview', 'offer'].includes(a.status || '')).length;
        const hired = recApps.filter((a) => a.status === 'hired').length;

        let candidatesAdded = 0;
        const { count: linkCount } = await supabase
          .from('candidate_org_links')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('created_by', recId);
        candidatesAdded = linkCount ?? 0;

        recruiterTable.push({
          user_id: recId,
          full_name: (profiles || []).find((p: { user_id: string; full_name: string | null }) => p.user_id === recId)?.full_name ?? 'Recruiter',
          job_count: recJobIds.length,
          applications_count: recApps.length,
          applications_last_30_days: appsLast30Rec,
          in_pipeline: inPipeline,
          hired,
          candidates_added: candidatesAdded
        });
      }

      setRecruiterRows(recruiterTable);

      // Job health: published jobs with 0 applications or no activity in 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const published = (jobs || []).filter((j: { status: string }) => j.status === 'published');
      const healthRows: JobHealthRow[] = [];
      for (const j of published) {
        const noApps = (j.applications_count ?? 0) === 0;
        const stale = j.updated_at ? new Date(j.updated_at) < fourteenDaysAgo : false;
        if (noApps || stale) {
          let recruiterName: string | undefined;
          if (j.recruiter_id) {
            const { data: p } = await supabase.from('profiles').select('full_name').eq('user_id', j.recruiter_id).maybeSingle();
            recruiterName = p?.full_name ?? undefined;
          }
          healthRows.push({
            id: j.id,
            title: j.title,
            applications_count: j.applications_count ?? 0,
            updated_at: j.updated_at,
            recruiter_name: recruiterName
          });
        }
      }
      healthRows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setJobHealth(healthRows.slice(0, 15));
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const trendUp = applicationsLast30 > applicationsPrev30;
  const trendLabel =
    applicationsPrev30 > 0
      ? `${trendUp ? '+' : ''}${Math.round(((applicationsLast30 - applicationsPrev30) / applicationsPrev30) * 100)}% vs prior 30d`
      : applicationsLast30 > 0
        ? 'New activity'
        : null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <BarChart3 className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  <span className="text-gradient-manager">Analytics</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">Your account manager role is active, but it isn’t linked to an organization yet.</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pt-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-sm font-sans text-muted-foreground">Please ask a platform admin to re-invite you or reassign you to a tenant.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <BarChart3 className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  <span className="text-gradient-manager">Analytics</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">Pipeline, recruiter performance, and job health for oversight.</p>
            </div>
            <Button variant="outline" asChild className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold shrink-0">
              <Link to="/manager/jobs">
                View jobs <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-8 pt-6 pb-6">
            {/* Key metrics with trend */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Open jobs"
                value={openJobs.toString()}
                icon={Briefcase}
                iconColor="text-manager"
                change="Published"
                changeType="neutral"
                className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
              />
              <StatCard
                title="Total applications"
                value={totalApplications.toString()}
                icon={FileText}
                iconColor="text-manager"
                change="All time"
                changeType="neutral"
                className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
              />
              <StatCard
                title="Applications (last 30d)"
                value={applicationsLast30.toString()}
                icon={TrendingUp}
                iconColor="text-manager"
                change={trendLabel ?? '—'}
                changeType={trendLabel ? (trendUp ? 'positive' : 'negative') : 'neutral'}
                className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
              />
              <StatCard
                title="Recruiters in scope"
                value={recruiterRows.length.toString()}
                icon={Users}
                iconColor="text-manager"
                change="Team"
                changeType="neutral"
                className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
              />
            </div>

            {/* Pipeline funnel */}
            <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <h2 className="font-display text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                <Target className="h-5 w-5 text-manager" strokeWidth={1.5} />
                Pipeline funnel
              </h2>
              <p className="text-sm text-muted-foreground font-sans mb-4">Applications by stage across all jobs in scope.</p>
              {applicationsByStatus.length === 0 ? (
                <p className="text-sm font-sans text-muted-foreground">No application data yet.</p>
              ) : (
                <div className="space-y-3">
                  {applicationsByStatus.map((item) => (
                    <div key={item.status} className="flex items-center gap-4">
                      <span className="w-28 text-sm font-sans capitalize">{item.status.replace(/_/g, ' ')}</span>
                      <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden min-w-[80px]">
                        <div
                          className="h-full bg-manager/80 rounded-full transition-all"
                          style={{ width: `${totalApplications ? (item.count / totalApplications) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-10 text-sm font-sans font-medium text-right">{item.count}</span>
                      {totalApplications > 0 && (
                        <span className="w-12 text-xs text-muted-foreground text-right">
                          {Math.round((item.count / totalApplications) * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Per-recruiter performance */}
            <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-manager/20">
              <div className="border-b border-manager/10 bg-manager/5 px-6 py-4 flex items-center gap-2">
                <UserCircle className="h-5 w-5 text-manager" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Recruiter performance</h2>
              </div>
              <div className="overflow-x-auto">
                {recruiterRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground font-sans">No recruiters in scope. Assign recruiters from Team.</div>
                ) : (
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left p-3 font-semibold text-foreground">Recruiter</th>
                        <th className="text-right p-3 font-semibold text-foreground">Jobs</th>
                        <th className="text-right p-3 font-semibold text-foreground">Applications</th>
                        <th className="text-right p-3 font-semibold text-foreground">Last 30d</th>
                        <th className="text-right p-3 font-semibold text-foreground">In pipeline</th>
                        <th className="text-right p-3 font-semibold text-foreground">Hired</th>
                        <th className="text-right p-3 font-semibold text-foreground">Candidates added</th>
                        <th className="w-24 p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {recruiterRows.map((rec) => (
                        <tr key={rec.user_id} className="border-b border-border hover:bg-manager/5 transition-colors">
                          <td className="p-3 font-medium text-foreground">{rec.full_name}</td>
                          <td className="p-3 text-right text-muted-foreground">{rec.job_count}</td>
                          <td className="p-3 text-right text-muted-foreground">{rec.applications_count}</td>
                          <td className="p-3 text-right text-manager font-medium">{rec.applications_last_30_days}</td>
                          <td className="p-3 text-right text-muted-foreground">{rec.in_pipeline}</td>
                          <td className="p-3 text-right text-muted-foreground">{rec.hired}</td>
                          <td className="p-3 text-right text-muted-foreground">{rec.candidates_added}</td>
                          <td className="p-3">
                            <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 h-8">
                              <Link to={`/manager/team/recruiters/${rec.user_id}`}>
                                View <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Job health: needs attention */}
            <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-manager/20">
              <div className="border-b border-manager/10 bg-manager/5 px-6 py-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-manager" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Job health</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-muted-foreground font-sans mb-4">Published jobs with no applications or no activity in the last 14 days.</p>
                {jobHealth.length === 0 ? (
                  <p className="text-sm font-sans text-muted-foreground">No jobs need attention.</p>
                ) : (
                  <ul className="space-y-2">
                    {jobHealth.map((job) => (
                      <li key={job.id}>
                        <Link
                          to="/manager/jobs"
                          className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border hover:border-manager/30 hover:bg-manager/5 transition-all group"
                        >
                          <div className="min-w-0">
                            <span className="font-sans font-medium text-foreground group-hover:text-manager transition-colors truncate block">{job.title}</span>
                            {job.recruiter_name && (
                              <span className="text-xs text-muted-foreground font-sans">{job.recruiter_name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-sans text-muted-foreground">{job.applications_count} applications</span>
                            <LinkIcon className="h-4 w-4 text-manager opacity-70" strokeWidth={1.5} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {jobHealth.length > 0 && (
                  <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium mt-4">
                    <Link to="/manager/jobs">View all jobs <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} /></Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
