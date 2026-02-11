import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import {
  Briefcase,
  Users,
  Clock,
  PlusCircle,
  ArrowRight,
  Key,
  Copy,
  Plus,
  Loader2,
  ClipboardList,
  GitBranch,
  CalendarDays,
  Layers,
  LayoutDashboard,
  Bot,
  ListChecks,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { toast } from 'sonner';

interface RecruiterStats {
  openJobs: number;
  totalApplications: number;
  totalCandidates: number;
}

interface InviteCode {
  id: string;
  code: string;
  uses_count: number;
  is_active: boolean;
}

interface RecentApplication {
  id: string;
  candidate_id?: string;
  candidate_name: string;
  job_title: string;
  applied_at: string;
  status?: string;
}

interface RecentJob {
  id: string;
  title: string;
  status: string;
}

interface RecentTalent {
  id: string;
  full_name: string | null;
  current_title: string | null;
}

interface RecentShortlist {
  id: string;
  name: string;
  candidates_count: number;
}

interface UpcomingInterview {
  id: string;
  scheduled_at: string;
  candidate_name: string;
  job_title: string;
}

interface RecentAgent {
  id: string;
  name: string;
  job_title: string | null;
  last_run_at: string | null;
}

export default function RecruiterDashboard() {
  const { roles, organizationId, user, currentRole, switchRole } = useAuth();
  const hasAccountManagerRole = roles.some((r) => r.role === 'account_manager');
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const [stats, setStats] = useState<RecruiterStats>({
    openJobs: 0,
    totalApplications: 0,
    totalCandidates: 0,
  });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentTalent, setRecentTalent] = useState<RecentTalent[]>([]);
  const [recentShortlists, setRecentShortlists] = useState<RecentShortlist[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterview[]>([]);
  const [recentAgents, setRecentAgents] = useState<RecentAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCode, setIsCreatingCode] = useState(false);
  const navigate = useNavigate();

  const orgId = organizationId || orgIdForRecruiterSuite(roles);

  useEffect(() => {
    if (orgId) {
      fetchDashboardData(ownerId);
    } else {
      setIsLoading(false);
    }
  }, [orgId, ownerId]);

  const fetchDashboardData = async (effectiveOwnerId: string | null) => {
    if (!orgId) return;

    try {
      // Fetch jobs (only this recruiter's when effectiveOwnerId is set)
      let jobsQuery = supabase.from('jobs').select('id, title, status, updated_at').eq('organization_id', orgId).order('updated_at', { ascending: false });
      if (effectiveOwnerId) jobsQuery = jobsQuery.eq('recruiter_id', effectiveOwnerId);
      const { data: jobs } = await jobsQuery;

      const openJobs = jobs?.filter(j => j.status === 'published').length || 0;
      const jobIds = jobs?.map(j => j.id) || [];
      setRecentJobs((jobs || []).slice(0, 3).map(j => ({ id: j.id, title: j.title || 'Untitled', status: j.status || 'draft' })));

      // Fetch applications for org's jobs
      let totalApplications = 0;
      const appsList: RecentApplication[] = [];

      if (jobIds.length > 0) {
        // Accurate count (not limited)
        const { count: appsCount } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds);

        totalApplications = appsCount || 0;

        // Recent applications list (include status for pipeline block)
        const { data: applications } = await supabase
          .from('applications')
          .select(`
            id, applied_at, candidate_id, status,
            jobs!inner(title),
            candidate_profiles(full_name, email)
          `)
          .in('job_id', jobIds)
          .order('applied_at', { ascending: false })
          .limit(5);

        (applications || []).forEach((app: any) => {
          const cp = app.candidate_profiles as any;
          const name =
            String(cp?.full_name || '').trim() ||
            (String(cp?.email || '').trim().split('@')[0] || '').trim() ||
            '';

          appsList.push({
            id: app.id,
            candidate_id: app.candidate_id,
            candidate_name: name,
            job_title: (app.jobs as any)?.title || 'Job',
            applied_at: app.applied_at,
            status: app.status || undefined,
          });
        });

        // Fallback: if any application has no name (join returned null or empty), fetch profiles by candidate_id
        const missingNames = appsList.filter((a: any) => !a.candidate_name);
        if (missingNames.length > 0) {
          const candidateIds = missingNames.map((a: any) => a.candidate_id).filter(Boolean);
          if (candidateIds.length > 0) {
            const { data: profiles } = await supabase
              .from('candidate_profiles')
              .select('id, full_name, email')
              .in('id', candidateIds);
            const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
            appsList.forEach((a: any) => {
              if (!a.candidate_name && a.candidate_id) {
                const p = profileById.get(a.candidate_id) as any;
                a.candidate_name =
                  String(p?.full_name || '').trim() ||
                  (String(p?.email || '').trim().split('@')[0] || '').trim() ||
                  'Applicant';
              }
            });
          }
          missingNames.forEach((a: any) => {
            if (!a.candidate_name) a.candidate_name = 'Applicant';
          });
        }
      }

      setRecentApplications(appsList);

      // Fetch candidates in org (talent pool size) and 3 most recently linked
      const { data: links } = await supabase
        .from('candidate_org_links')
        .select('candidate_id, created_at')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      const candidateIds = Array.from(new Set((links || []).map((l: any) => String(l.candidate_id)).filter(Boolean)));
      const recentCandidateIds = (links || []).slice(0, 3).map((l: any) => l.candidate_id).filter(Boolean);
      if (recentCandidateIds.length > 0) {
        const { data: recentProfiles } = await supabase
          .from('candidate_profiles')
          .select('id, full_name, current_title')
          .in('id', recentCandidateIds);
        setRecentTalent((recentProfiles || []).map((p: any) => ({ id: p.id, full_name: p.full_name, current_title: p.current_title })));
      } else {
        setRecentTalent([]);
      }

      // Shortlists (recent 3)
      const { data: shortlistRows } = await supabase
        .from('candidate_shortlists')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (shortlistRows?.length) {
        const { data: sc } = await supabase.from('shortlist_candidates').select('shortlist_id').in('shortlist_id', shortlistRows.map((s: any) => s.id));
        const countByShortlist = new Map<string, number>();
        (sc || []).forEach((r: any) => countByShortlist.set(r.shortlist_id, (countByShortlist.get(r.shortlist_id) || 0) + 1));
        setRecentShortlists(shortlistRows.map((s: any) => ({ id: s.id, name: s.name || 'Unnamed', candidates_count: countByShortlist.get(s.id) || 0 })));
      } else {
        setRecentShortlists([]);
      }

      // Upcoming interviews (next 3)
      if (jobIds.length > 0) {
        const { data: appIds } = await supabase.from('applications').select('id').in('job_id', jobIds);
        const applicationIds = (appIds || []).map((a: any) => a.id).filter(Boolean);
        if (applicationIds.length > 0) {
          const { data: interviewRows } = await supabase
            .from('interview_schedules')
            .select('id, application_id, scheduled_at')
            .in('application_id', applicationIds)
            .eq('status', 'scheduled')
            .gte('scheduled_at', new Date().toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(3);
          if (interviewRows?.length) {
            const ids = interviewRows.map((r: any) => r.application_id).filter(Boolean);
            const { data: appDetails } = await supabase
              .from('applications')
              .select('id, candidate_profiles(full_name, current_title), jobs(title)')
              .in('id', ids);
            const appMap = new Map((appDetails || []).map((a: any) => [a.id, a]));
            setUpcomingInterviews(interviewRows.map((r: any) => {
              const app = appMap.get(r.application_id) as any;
              const cp = app?.candidate_profiles;
              const name = cp?.full_name || cp?.current_title || 'Candidate';
              const jobTitle = app?.jobs?.title || 'Job';
              return { id: r.id, scheduled_at: r.scheduled_at, candidate_name: name, job_title: jobTitle };
            }));
          } else {
            setUpcomingInterviews([]);
          }
        } else {
          setUpcomingInterviews([]);
        }
      } else {
        setUpcomingInterviews([]);
      }

      // AI agents (recent 3)
      let agentsQuery = supabase
        .from('ai_recruiting_agents')
        .select('id, name, last_run_at, jobs(title)')
        .eq('organization_id', orgId)
        .order('last_run_at', { ascending: false, nullsFirst: false })
        .limit(3);
      if (effectiveOwnerId) agentsQuery = agentsQuery.eq('created_by', effectiveOwnerId);
      const { data: agentRows } = await agentsQuery;
      setRecentAgents((agentRows || []).map((a: any) => ({
        id: a.id,
        name: a.name || 'Unnamed',
        job_title: a.jobs?.title ?? null,
        last_run_at: a.last_run_at ?? null,
      })));

      // Fetch invite codes
      const { data: codes } = await supabase
        .from('organization_invite_codes')
        .select('id, code, uses_count, is_active')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (codes) {
        setInviteCodes(codes);
      }

      setStats({
        openJobs,
        totalApplications,
        totalCandidates: candidateIds.length || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const createInviteCode = async () => {
    if (!orgId) return;

    setIsCreatingCode(true);
    try {
      const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');

      if (codeError) throw codeError;

      const { data, error } = await supabase
        .from('organization_invite_codes')
        .insert({
          organization_id: orgId,
          code: codeData,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (error) throw error;

      setInviteCodes([{ id: data.id, code: data.code, uses_count: 0, is_active: true }, ...inviteCodes.slice(0, 2)]);
      toast.success('Invite code created!');
    } catch (error) {
      console.error('Error creating invite code:', error);
      toast.error('Failed to create invite code');
    } finally {
      setIsCreatingCode(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  /** Big rectangle block: title, up to 3 recent rows, then "Go to X" button. */
  const QuickActionBlock = ({
    title,
    href,
    icon: Icon,
    children,
    emptyMessage,
  }: {
    title: string;
    href: string;
    icon: any;
    children: React.ReactNode;
    emptyMessage: string;
  }) => (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[200px]">
      <div className="shrink-0 flex items-center gap-2 p-4 border-b border-border bg-muted/30">
        <div className="h-9 w-9 rounded-lg bg-recruiter/10 text-recruiter border border-recruiter/20 flex items-center justify-center">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <h3 className="font-display font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
        {children}
        {(!children || (Array.isArray(children) && (children as unknown[]).length === 0)) && (
          <p className="text-sm text-muted-foreground font-sans py-2">{emptyMessage}</p>
        )}
      </div>
      <div className="shrink-0 p-4 pt-0">
        <Button variant="outline" size="sm" className="w-full rounded-lg border-recruiter/20 text-recruiter hover:bg-recruiter/10" asChild>
          <Link to={href}>Go to {title} <ArrowRight className="ml-2 h-3.5 w-3.5" strokeWidth={1.5} /></Link>
        </Button>
      </div>
    </div>
  );

  const statusLabel = (s: string | undefined) => {
    if (!s) return 'Applied';
    const lower = s.toLowerCase().replace(/_/g, ' ');
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <LayoutDashboard className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Recruiter <span className="text-gradient-recruiter">Dashboard</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Your open jobs, applicants, talent pool, and recent activity at a glance.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Button className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold shadow-lg" asChild>
                <Link to="/recruiter/jobs/new">
                  <PlusCircle className="mr-2 h-4 w-4" strokeWidth={1.5} /> Post a Job
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-8 pt-6 pb-6 animate-in-view">

        {/* Switch to Account Manager CTA — only when user has both Recruiter and AM roles */}
        {hasAccountManagerRole && (
          <div className="rounded-xl border border-recruiter/20 bg-recruiter/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <Users className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="font-display font-semibold text-foreground">Team &amp; oversight</h2>
                <p className="text-sm text-muted-foreground font-sans">Switch to Account Manager to view org metrics, team progress, and audit logs.</p>
              </div>
            </div>
            <Button
              onClick={() => { switchRole('account_manager'); navigate('/manager'); }}
              className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold shrink-0"
            >
              Switch to Account Manager <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        )}

        {/* Stats — what matters for daily work */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <StatCard
            title="Open jobs"
            value={stats.openJobs.toString()}
            icon={Briefcase}
            iconColor="text-recruiter"
            change="Published and accepting applications"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20 cursor-pointer"
            onClick={() => navigate('/recruiter/jobs')}
          />
          <StatCard
            title="Applicants"
            value={stats.totalApplications.toString()}
            icon={ClipboardList}
            iconColor="text-recruiter"
            change="Across your jobs"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20 cursor-pointer"
            onClick={() => navigate('/recruiter/candidates')}
          />
          <StatCard
            title="Talent pool"
            value={stats.totalCandidates.toString()}
            icon={Users}
            iconColor="text-recruiter"
            change="Candidates in your org"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20 cursor-pointer"
            onClick={() => navigate('/recruiter/talent-pool')}
          />
        </div>

        {/* Quick actions — 2 big blocks per row; each shows 3 recent rows + link */}
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
              <ListChecks className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
              Quick actions
            </h2>
            <p className="text-sm text-muted-foreground font-sans mt-1">Recent items and a link to each page.</p>
          </div>

          <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-2">
            <QuickActionBlock title="My Jobs" href="/recruiter/jobs" icon={Briefcase} emptyMessage="No jobs yet. Post one to get started.">
              {recentJobs.slice(0, 3).map((j) => (
                <div key={j.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/jobs')}>
                  <p className="font-sans font-medium text-foreground truncate">{j.title}</p>
                  <p className="text-xs text-muted-foreground font-sans capitalize">{j.status}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="My Candidates" href="/recruiter/candidates" icon={ClipboardList} emptyMessage="No applicants yet. They’ll appear when candidates apply.">
              {recentApplications.slice(0, 3).map((app) => (
                <div key={app.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/candidates')}>
                  <p className="font-sans font-medium text-foreground truncate">{app.candidate_name}</p>
                  <p className="text-xs text-muted-foreground font-sans truncate">{app.job_title} · {formatDate(app.applied_at)}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="Pipelines" href="/recruiter/pipeline" icon={GitBranch} emptyMessage="No pipeline activity yet. Move candidates in the pipeline.">
              {recentApplications.slice(0, 3).map((app) => (
                <div key={app.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/pipeline')}>
                  <p className="font-sans font-medium text-foreground truncate">{app.candidate_name}</p>
                  <p className="text-xs text-muted-foreground font-sans truncate">{app.job_title} · {statusLabel(app.status)}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="Talent Pool" href="/recruiter/talent-pool" icon={Users} emptyMessage="Talent pool is empty. Upload resumes or add from Talent Search.">
              {recentTalent.slice(0, 3).map((t) => (
                <div key={t.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/talent-pool')}>
                  <p className="font-sans font-medium text-foreground truncate">{t.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground font-sans truncate">{t.current_title || '—'}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="Shortlists" href="/recruiter/shortlists" icon={Layers} emptyMessage="No shortlists yet. Create one from Shortlists.">
              {recentShortlists.slice(0, 3).map((s) => (
                <div key={s.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/shortlists')}>
                  <p className="font-sans font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground font-sans">{s.candidates_count} candidate{s.candidates_count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="Interview Schedule" href="/recruiter/interviews" icon={CalendarDays} emptyMessage="No upcoming interviews. Schedule from the Interviews page.">
              {upcomingInterviews.slice(0, 3).map((i) => (
                <div key={i.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/interviews')}>
                  <p className="font-sans font-medium text-foreground truncate">{i.candidate_name}</p>
                  <p className="text-xs text-muted-foreground font-sans truncate">{i.job_title} · {formatDate(i.scheduled_at)}</p>
                </div>
              ))}
            </QuickActionBlock>

            <QuickActionBlock title="AI Agents" href="/recruiter/agents" icon={Bot} emptyMessage="No AI agents yet. Create one to match candidates to jobs.">
              {recentAgents.slice(0, 3).map((a) => (
                <div key={a.id} className="p-3 rounded-lg border border-border bg-background/50 hover:bg-recruiter/5 transition-colors cursor-pointer" onClick={() => navigate('/recruiter/agents')}>
                  <p className="font-sans font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground font-sans truncate">{a.job_title || 'No job linked'}{a.last_run_at ? ` · Ran ${formatDate(a.last_run_at)}` : ''}</p>
                </div>
              ))}
            </QuickActionBlock>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2">
          {/* Invite Codes */}
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
              <Key className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
              Invite Candidates
            </h2>
            <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20">
              <div className="flex flex-row items-center justify-between pb-4 border-b border-recruiter/10 bg-recruiter/5 -mx-6 px-6 -mt-6 mb-4 rounded-t-xl">
                <div className="space-y-1">
                  <h3 className="text-base font-display font-medium flex items-center gap-2 text-foreground">
                    Invite codes
                  </h3>
                  <p className="text-sm text-muted-foreground font-sans">Share a code so candidates can sign up and apply to your jobs.</p>
                </div>
                <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm" className="rounded-lg border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold">
                  {isCreatingCode ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <><Plus className="h-4 w-4 mr-1" strokeWidth={1.5} /> Generate</>}
                </Button>
              </div>
              <div>
                {inviteCodes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground font-sans text-sm">
                    No active codes. Generate one to get started.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inviteCodes.map((code) => (
                      <div key={code.id} className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-recruiter/5 transition-all flex items-center justify-between group">
                        <div className="flex flex-col">
                          <code className="font-mono font-bold text-lg text-recruiter tracking-wider">{code.code}</code>
                          <span className="text-xs text-muted-foreground font-sans">Created by you</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-sans bg-muted/50 px-2.5 py-1 rounded-lg border border-border">{code.uses_count} uses</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-recruiter/20 hover:text-recruiter" onClick={() => copyCode(code.code)}>
                            <Copy className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Applications / Activity */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
                <Clock className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                Recent Applications
              </h2>
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-recruiter hover:text-recruiter/80 hover:bg-recruiter/10 font-sans">
                <Link to="/recruiter/candidates">View All <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} /></Link>
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20 min-h-[250px]">
              {recentApplications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground font-sans text-sm p-4">
                  <div className="h-12 w-12 rounded-full bg-recruiter/10 border border-recruiter/20 flex items-center justify-center mb-3">
                    <Clock className="h-6 w-6 text-recruiter opacity-60" strokeWidth={1.5} />
                  </div>
                  No recent applications found.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentApplications.map((app) => {
                    const initials = app.candidate_name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div key={app.id} className="p-3 rounded-xl border border-border hover:bg-recruiter/5 transition-all flex items-center justify-between group cursor-pointer" onClick={() => navigate('/recruiter/candidates')}>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-recruiter/10 text-recruiter flex items-center justify-center text-sm font-bold border border-recruiter/20 font-sans">
                            {initials}
                          </div>
                          <div>
                            <p className="font-sans font-medium group-hover:text-recruiter transition-colors text-sm">{app.candidate_name}</p>
                            <p className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                              <Briefcase className="h-3 w-3" strokeWidth={1.5} />
                              {app.job_title}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground font-sans font-mono bg-muted/30 px-2 py-1 rounded-lg">{formatDate(app.applied_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}