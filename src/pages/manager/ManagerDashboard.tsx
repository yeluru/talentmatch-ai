import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Briefcase, Users, Clock, Copy, Plus, Loader2, Key, Target, Award, ArrowRight, LayoutDashboard, AlertCircle, Activity, UserCircle, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';

interface OrgStats {
  openJobs: number;
  totalRecruiters: number;
  totalCandidates: number;
  totalApplications: number;
}

interface InviteCode {
  id: string;
  code: string;
  uses_count: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

interface RecentApplication {
  id: string;
  candidate_name: string;
  job_title: string;
  status: string;
  applied_at: string;
}

interface NeedsAttentionJob {
  id: string;
  title: string;
  status: string;
  applications_count: number;
  updated_at: string;
  recruiter_name?: string;
}

interface RecruiterActivity {
  user_id: string;
  full_name: string;
  job_count: number;
  applications_count: number;
  applications_last_7_days: number;
  /** Application counts by status for pipeline oversight */
  by_status: Record<string, number>;
  /** Candidates added to org by this recruiter (candidate_org_links created_by) */
  candidates_added: number;
  /** Resumes on candidates this recruiter added */
  resumes_on_their_candidates: number;
  /** Imports by source: link_type -> count (bulk_import, sourced, resume_upload, google_xray, etc.) */
  imports_by_type: Record<string, number>;
}

/** One item in the "what recruiters did" feed (status change or engagement update) */
interface RecentActivityItem {
  type: 'status_change' | 'engagement_update';
  at: string;
  recruiter_name: string;
  recruiter_user_id: string;
  candidate_name: string;
  job_title: string;
  /** For status_change: new application status; for engagement_update: stage */
  label: string;
}

export default function ManagerDashboard() {
  const { organizationId, currentRole, user, roles, switchRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<OrgStats>({ openJobs: 0, totalRecruiters: 0, totalCandidates: 0, totalApplications: 0 });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [needsAttentionJobs, setNeedsAttentionJobs] = useState<NeedsAttentionJob[]>([]);
  const [recruiterActivity, setRecruiterActivity] = useState<RecruiterActivity[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [assignedRecruiterIds, setAssignedRecruiterIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCode, setIsCreatingCode] = useState(false);

  const hasRecruiterRole = roles.some((r) => r.role === 'recruiter');

  useEffect(() => {
    // Wait for auth to finish loading before deciding on data fetch
    if (authLoading) return;

    if (organizationId) {
      fetchOrgData();
    } else {
      // No org ID available after auth loaded - stop loading state
      setIsLoading(false);
    }
  }, [organizationId, authLoading]);

  const fetchOrgData = async () => {
    if (!organizationId) return;

    try {
      // Fetch jobs (id, status, recruiter_id for activity)
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, recruiter_id')
        .eq('organization_id', organizationId);

      const openJobs = jobs?.filter(j => j.status === 'published').length || 0;

      // Fetch team members (recruiters in same org)
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', organizationId);

      // For account managers, count only recruiters assigned to them.
      let recruitersCount = rolesData?.filter(r => r.role === 'recruiter').length || 0;
      if (currentRole === 'account_manager' && user?.id) {
        const { data: assigned } = await supabase
          .from('account_manager_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('organization_id', organizationId)
          .eq('account_manager_user_id', user.id);
        recruitersCount = assigned?.length || 0;
      }

      // For account managers: which recruiters are assigned to this AM (used for activity scope)
      let recruiterIdsInScope: Set<string> = new Set();
      if (currentRole === 'account_manager' && user?.id) {
        const { data: assigned } = await supabase
          .from('account_manager_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('organization_id', organizationId)
          .eq('account_manager_user_id', user.id);
        recruiterIdsInScope = new Set((assigned || []).map((a: { recruiter_user_id: string }) => a.recruiter_user_id));
        setAssignedRecruiterIds(recruiterIdsInScope);
      } else if (rolesData) {
        recruiterIdsInScope = new Set(rolesData.filter(r => r.role === 'recruiter').map(r => r.user_id));
        setAssignedRecruiterIds(recruiterIdsInScope);
      }

      // Fetch team member profiles
      if (rolesData && rolesData.length > 0) {
        const userIds = rolesData.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, user_id')
          .in('user_id', userIds);

        if (profiles) {
          const members = profiles.map(p => ({
            id: p.id,
            user_id: p.user_id,
            full_name: p.full_name,
            email: p.email,
            role: rolesData.find(r => r.user_id === p.user_id)?.role || 'unknown'
          }));
          setTeamMembers(members);
        }
      }

      // Fetch candidates in org
      const { data: candidates } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('organization_id', organizationId);

      // Fetch applications for org's jobs
      const jobIds = jobs?.map(j => j.id) || [];
      let applicationsCount = 0;
      const appsList: RecentApplication[] = [];

      if (jobIds.length > 0) {
        const { count: totalApps } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds);
        applicationsCount = totalApps ?? 0;

        const { data: applications } = await supabase
          .from('applications')
          .select(`
            id, status, applied_at, 
            candidate_id,
            jobs!inner(title)
          `)
          .in('job_id', jobIds)
          .order('applied_at', { ascending: false })
          .limit(5);

        if (applications) {
          for (const app of applications) {
            const { data: candidateProfile } = await supabase
              .from('candidate_profiles')
              .select('user_id, full_name, email')
              .eq('id', app.candidate_id)
              .single();

            let candidateName = (candidateProfile?.full_name || '').trim();
            if (!candidateName && candidateProfile?.user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('user_id', candidateProfile.user_id)
                .single();
              candidateName = (profile?.full_name || '').trim();
            }
            if (!candidateName && (candidateProfile?.email || '').trim()) {
              candidateName = (candidateProfile.email || '').trim().split('@')[0] || '';
            }
            if (!candidateName) candidateName = 'Applicant';

            appsList.push({
              id: app.id,
              candidate_name: candidateName,
              job_title: (app.jobs as any)?.title || 'Job',
              status: app.status || 'applied',
              applied_at: app.applied_at
            });
          }
        }
      }

      setRecentApplications(appsList);

      // Needs attention: published jobs with no applications or no activity in 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const { data: orgJobs } = await supabase
        .from('jobs')
        .select('id, title, status, applications_count, updated_at, recruiter_id')
        .eq('organization_id', organizationId)
        .eq('status', 'published');

      const needsAttention: NeedsAttentionJob[] = [];
      if (orgJobs) {
        for (const j of orgJobs) {
          const noApps = (j.applications_count ?? 0) === 0;
          const stale = j.updated_at ? new Date(j.updated_at) < fourteenDaysAgo : false;
          if (noApps || stale) {
            let recruiterName: string | undefined;
            if (j.recruiter_id) {
              const { data: prof } = await supabase.from('profiles').select('full_name').eq('user_id', j.recruiter_id).single();
              recruiterName = prof?.full_name ?? undefined;
            }
            needsAttention.push({
              id: j.id,
              title: j.title,
              status: j.status,
              applications_count: j.applications_count ?? 0,
              updated_at: j.updated_at,
              recruiter_name: recruiterName
            });
          }
        }
        needsAttention.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setNeedsAttentionJobs(needsAttention.slice(0, 10));
      }

      // Applications by status per job (for pipeline breakdown)
      const jobIdToRecruiter: Record<string, string> = {};
      (jobs || []).forEach((j: { id: string; recruiter_id?: string }) => {
        if (j.recruiter_id) jobIdToRecruiter[j.id] = j.recruiter_id;
      });
      const statusCountByRecruiter: Record<string, Record<string, number>> = {};
      if (jobIds.length > 0) {
        const { data: appStatusRows } = await supabase
          .from('applications')
          .select('job_id, status')
          .in('job_id', jobIds);
        (appStatusRows || []).forEach((row: { job_id: string; status: string }) => {
          const recId = jobIdToRecruiter[row.job_id];
          if (!recId) return;
          if (!statusCountByRecruiter[recId]) statusCountByRecruiter[recId] = {};
          const s = row.status || 'applied';
          statusCountByRecruiter[recId][s] = (statusCountByRecruiter[recId][s] || 0) + 1;
        });
      }

      // Candidates added / imports per recruiter (candidate_org_links created_by)
      const recruiterIds = rolesData
        ?.filter(r => r.role === 'recruiter')
        .map(r => r.user_id)
        .filter(id => recruiterIdsInScope.size === 0 || recruiterIdsInScope.has(id)) ?? [];
      const linksByRecruiter: Record<string, { candidate_id: string; link_type: string }[]> = {};
      recruiterIds.forEach((id) => { linksByRecruiter[id] = []; });
      if (recruiterIds.length > 0) {
        const { data: linkRows } = await supabase
          .from('candidate_org_links')
          .select('created_by, candidate_id, link_type')
          .eq('organization_id', organizationId)
          .in('created_by', recruiterIds);
        (linkRows || []).forEach((row: { created_by: string; candidate_id: string; link_type: string | null }) => {
          if (linksByRecruiter[row.created_by]) {
            linksByRecruiter[row.created_by].push({ candidate_id: row.candidate_id, link_type: row.link_type || 'sourced' });
          }
        });
      }
      const candidateIdsFromLinks = [...new Set(Object.values(linksByRecruiter).flat().map((l) => l.candidate_id))];
      let resumeCountByCandidate: Record<string, number> = {};
      if (candidateIdsFromLinks.length > 0) {
        const { data: resumeRows } = await supabase
          .from('resumes')
          .select('candidate_id')
          .in('candidate_id', candidateIdsFromLinks);
        (resumeRows || []).forEach((r: { candidate_id: string }) => {
          resumeCountByCandidate[r.candidate_id] = (resumeCountByCandidate[r.candidate_id] || 0) + 1;
        });
      }

      // Recruiter activity: only recruiters in scope (assigned for AM, all for org_admin)
      if (recruiterIds.length > 0 && jobs) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const activityList: RecruiterActivity[] = [];
        const { data: profilesList } = await supabase.from('profiles').select('user_id, full_name').in('user_id', recruiterIds);
        for (const recId of recruiterIds) {
          const recJobs = jobs.filter((j: { recruiter_id?: string }) => j.recruiter_id === recId);
          const recJobIds = recJobs.map((j: { id: string }) => j.id);
          let applicationsInJobs = 0;
          let appsLast7 = 0;
          if (recJobIds.length > 0) {
            const { count: appCount } = await supabase
              .from('applications')
              .select('id', { count: 'exact', head: true })
              .in('job_id', recJobIds);
            applicationsInJobs = appCount ?? 0;
            const { count: recentCount } = await supabase
              .from('applications')
              .select('id', { count: 'exact', head: true })
              .in('job_id', recJobIds)
              .gte('applied_at', sevenDaysAgo.toISOString());
            appsLast7 = recentCount ?? 0;
          }
          const fullName = profilesList?.find(p => p.user_id === recId)?.full_name ?? 'Recruiter';
          const by_status = statusCountByRecruiter[recId] || {};
          const links = linksByRecruiter[recId] || [];
          const candidates_added = links.length;
          const imports_by_type: Record<string, number> = {};
          links.forEach((l) => {
            const t = (l.link_type || 'sourced').replace(/\s+/g, '_').toLowerCase();
            imports_by_type[t] = (imports_by_type[t] || 0) + 1;
          });
          let resumes_on_their_candidates = 0;
          links.forEach((l) => {
            resumes_on_their_candidates += resumeCountByCandidate[l.candidate_id] || 0;
          });
          activityList.push({
            user_id: recId,
            full_name: fullName,
            job_count: recJobs.length,
            applications_count: applicationsInJobs,
            applications_last_7_days: appsLast7,
            by_status,
            candidates_added,
            resumes_on_their_candidates,
            imports_by_type
          });
        }
        setRecruiterActivity(activityList);
      } else {
        setRecruiterActivity([]);
      }

      // Recent activity feed: what recruiters did (status changes + engagement updates)
      const recruiterIdsArray = Array.from(recruiterIdsInScope.size > 0 ? recruiterIdsInScope : (rolesData?.filter(r => r.role === 'recruiter').map(r => r.user_id) ?? []));
      const activityItems: RecentActivityItem[] = [];
      if (jobIds.length > 0 && recruiterIdsArray.length > 0) {
        const { data: appIdsData } = await supabase.from('applications').select('id').in('job_id', jobIds);
        const appIds = (appIdsData || []).map((a: { id: string }) => a.id);
        if (appIds.length > 0) {
          const { data: historyRows } = await supabase
            .from('application_status_history')
            .select('application_id, changed_by, new_status, created_at')
            .in('application_id', appIds)
            .in('changed_by', recruiterIdsArray)
            .order('created_at', { ascending: false })
            .limit(20);
          const appIdSet = new Set((historyRows || []).map((h: { application_id: string }) => h.application_id));
          const appIdList = Array.from(appIdSet);
          if (appIdList.length > 0) {
            const { data: appRows } = await supabase.from('applications').select('id, job_id, candidate_id').in('id', appIdList);
            const jobIdsFromHistory = [...new Set((appRows || []).map((a: { job_id: string }) => a.job_id))];
            const candidateIdsFromHistory = [...new Set((appRows || []).map((a: { candidate_id: string }) => a.candidate_id))];
            const { data: jobRows } = await supabase.from('jobs').select('id, title').in('id', jobIdsFromHistory);
            const { data: candidateRows } = await supabase.from('candidate_profiles').select('id, full_name').in('id', candidateIdsFromHistory);
            const { data: actorRows } = await supabase.from('profiles').select('user_id, full_name').in('user_id', recruiterIdsArray);
            const jobMap: Record<string, string> = {};
            (jobRows || []).forEach((j: { id: string; title: string }) => { jobMap[j.id] = j.title; });
            const candidateMap: Record<string, string> = {};
            (candidateRows || []).forEach((c: { id: string; full_name: string | null }) => { candidateMap[c.id] = (c.full_name || '').trim() || 'Candidate'; });
            const actorMap: Record<string, string> = {};
            (actorRows || []).forEach((p: { user_id: string; full_name: string | null }) => { actorMap[p.user_id] = (p.full_name || '').trim() || 'Recruiter'; });
            const appMap: Record<string, { job_id: string; candidate_id: string }> = {};
            (appRows || []).forEach((a: { id: string; job_id: string; candidate_id: string }) => { appMap[a.id] = { job_id: a.job_id, candidate_id: a.candidate_id }; });
            (historyRows || []).forEach((h: { application_id: string; changed_by: string; new_status: string; created_at: string }) => {
              const app = appMap[h.application_id];
              if (!app) return;
              activityItems.push({
                type: 'status_change',
                at: h.created_at,
                recruiter_name: actorMap[h.changed_by] || 'Recruiter',
                recruiter_user_id: h.changed_by,
                candidate_name: candidateMap[app.candidate_id] || 'Candidate',
                job_title: jobMap[app.job_id] || 'Job',
                label: (h.new_status || 'updated').replace(/_/g, ' ')
              });
            });
          }
        }
        const { data: engagementRows } = await supabase
          .from('candidate_engagements')
          .select('id, stage, updated_at, owner_user_id, candidate_id, job_id')
          .eq('organization_id', organizationId)
          .in('owner_user_id', recruiterIdsArray)
          .not('job_id', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(15);
        if (engagementRows && engagementRows.length > 0) {
          const engJobIds = [...new Set(engagementRows.map((e: { job_id: string }) => e.job_id).filter(Boolean))];
          const engCandidateIds = [...new Set(engagementRows.map((e: { candidate_id: string }) => e.candidate_id))];
          const { data: engJobs } = await supabase.from('jobs').select('id, title').in('id', engJobIds);
          const { data: engCandidates } = await supabase.from('candidate_profiles').select('id, full_name').in('id', engCandidateIds);
          const { data: engActors } = await supabase.from('profiles').select('user_id, full_name').in('user_id', recruiterIdsArray);
          const engJobMap: Record<string, string> = {};
          (engJobs || []).forEach((j: { id: string; title: string }) => { engJobMap[j.id] = j.title; });
          const engCandidateMap: Record<string, string> = {};
          (engCandidates || []).forEach((c: { id: string; full_name: string | null }) => { engCandidateMap[c.id] = (c.full_name || '').trim() || 'Candidate'; });
          const engActorMap: Record<string, string> = {};
          (engActors || []).forEach((p: { user_id: string; full_name: string | null }) => { engActorMap[p.user_id] = (p.full_name || '').trim() || 'Recruiter'; });
          engagementRows.forEach((e: { stage: string; updated_at: string; owner_user_id: string; candidate_id: string; job_id: string }) => {
            activityItems.push({
              type: 'engagement_update',
              at: e.updated_at,
              recruiter_name: engActorMap[e.owner_user_id] || 'Recruiter',
              recruiter_user_id: e.owner_user_id,
              candidate_name: engCandidateMap[e.candidate_id] || 'Candidate',
              job_title: engJobMap[e.job_id] || 'Job',
              label: (e.stage || 'updated').replace(/_/g, ' ')
            });
          });
        }
        activityItems.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        setRecentActivity(activityItems.slice(0, 25));
      } else {
        setRecentActivity([]);
      }

      // Fetch invite codes
      const { data: codes } = await supabase
        .from('organization_invite_codes')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (codes) {
        setInviteCodes(codes as InviteCode[]);
      }

      setStats({
        openJobs,
        totalRecruiters: recruitersCount,
        totalCandidates: candidates?.length || 0,
        totalApplications: applicationsCount
      });
    } catch (error) {
      console.error('Error fetching org data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createInviteCode = async () => {
    if (!organizationId) return;

    setIsCreatingCode(true);
    try {
      // Generate random code
      const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');

      if (codeError) throw codeError;

      const { data, error } = await supabase
        .from('organization_invite_codes')
        .insert({
          organization_id: organizationId,
          code: codeData,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (error) throw error;

      setInviteCodes([data as InviteCode, ...inviteCodes]);
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  /** Pipeline statuses to show in recruiter card (in order) */
  const PIPELINE_STATUSES = ['screening', 'reviewing', 'interview', 'offer', 'hired'];



  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <LayoutDashboard className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Manager <span className="text-gradient-manager">Dashboard</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Organization overview, team activity, and metrics.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Button variant="outline" asChild className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                <Link to="/manager/team">
                  <Users className="mr-2 h-4 w-4" strokeWidth={1.5} /> Manage Team
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-8 pt-6 pb-6 animate-in-view">
        {/* Switch to Recruiter CTA — only when user has both AM and Recruiter roles */}
        {hasRecruiterRole && (
          <div className="rounded-xl border border-manager/20 bg-manager/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <Briefcase className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="font-display font-semibold text-foreground">Also do recruiting?</h2>
                <p className="text-sm text-muted-foreground font-sans">Switch to Recruiter to post jobs, manage talent, and run pipelines.</p>
              </div>
            </div>
            <Button
              onClick={() => { switchRole('recruiter'); navigate('/recruiter'); }}
              className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold shrink-0"
            >
              Switch to Recruiter <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Open Jobs"
            value={stats.openJobs.toString()}
            icon={Briefcase}
            iconColor="text-manager"
            change="Active Listings"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
          />
          <StatCard
            title="Recruiters"
            value={stats.totalRecruiters.toString()}
            icon={Users}
            iconColor="text-manager"
            change="Team Size"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
          />
          <StatCard
            title="Candidates"
            value={stats.totalCandidates.toString()}
            icon={Target}
            iconColor="text-manager"
            change="Total Pipeline"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
          />
          <StatCard
            title="Applications"
            value={stats.totalApplications.toString()}
            icon={Clock}
            iconColor="text-manager"
            change="Recent Activity"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20"
          />
        </div>

        {/* Team activity — recruiters + recent moves merged */}
        <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-manager/20">
          <div className="border-b border-manager/10 bg-manager/5 px-6 py-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-manager" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-semibold text-foreground">Team activity</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-8 lg:grid-cols-[1fr,1fr]">
              {/* Recruiters — summary list */}
              <div>
                <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground mb-3">Recruiters</h3>
                {recruiterActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-sans py-4">No recruiters in scope. Assign recruiters from Team.</p>
                ) : (
                  <ul className="space-y-2">
                    {recruiterActivity.map((rec) => (
                      <li key={rec.user_id}>
                        <Link
                          to={`/manager/team/recruiters/${rec.user_id}`}
                          className="block p-3 rounded-lg border border-border hover:border-manager/30 hover:bg-manager/5 transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-manager/10 text-manager border border-manager/20 flex items-center justify-center shrink-0">
                                <UserCircle className="h-4 w-4" strokeWidth={1.5} />
                              </div>
                              <span className="font-sans font-medium text-foreground group-hover:text-manager transition-colors truncate">{rec.full_name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs font-sans text-muted-foreground">
                              <span>{rec.job_count} jobs</span>
                              <span>·</span>
                              <span className="text-manager font-medium">{rec.applications_last_7_days} new</span>
                            </div>
                          </div>
                          <div className="mt-1.5 ml-10 text-xs text-muted-foreground font-sans space-y-0.5">
                            <p>{rec.applications_count} applications</p>
                            {(rec.candidates_added > 0 || rec.resumes_on_their_candidates > 0) && (
                              <p>
                                <span className="font-medium text-manager/90">{rec.candidates_added} candidates added</span>
                                {rec.resumes_on_their_candidates > 0 && (
                                  <span className="ml-1"> · <span className="font-medium text-manager/90">{rec.resumes_on_their_candidates} resumes</span></span>
                                )}
                                {Object.keys(rec.imports_by_type).length > 0 && (
                                  <span className="ml-1">
                                    {' · '}
                                    {Object.entries(rec.imports_by_type)
                                      .filter(([, n]) => n > 0)
                                      .map(([t, n], i) => {
                                        const label = t === 'bulk_import' ? 'bulk' : t === 'resume_upload' ? 'upload' : t === 'google_xray' || t === 'web_search' ? 'search' : t.replace(/_/g, ' ');
                                        return (
                                          <span key={t} className="font-medium text-manager/90">
                                            {i > 0 && ' · '}{label}: {n}
                                          </span>
                                        );
                                      })}
                                  </span>
                                )}
                              </p>
                            )}
                            {Object.keys(rec.by_status).length > 0 && (
                              <p className="flex flex-wrap gap-x-2 gap-y-0.5">
                                {[...PIPELINE_STATUSES, 'applied'].filter((s) => (rec.by_status[s] ?? 0) > 0).map((s) => (
                                  <span key={s} className="font-medium text-manager/90">{s}: {rec.by_status[s]}</span>
                                ))}
                                {Object.entries(rec.by_status)
                                  .filter(([s, n]) => n > 0 && !PIPELINE_STATUSES.includes(s) && s !== 'applied')
                                  .map(([s, n]) => (
                                    <span key={s} className="font-medium text-manager/90">{s}: {n}</span>
                                  ))}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recent moves — what they did */}
              <div>
                <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground mb-3">Recent moves</h3>
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border bg-muted/20">
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-sans p-6 text-center">No recent moves yet. Status changes and engagement updates will appear here.</p>
                  ) : (
                    <ul className="divide-y divide-border p-2">
                      {recentActivity.slice(0, 15).map((item, idx) => (
                        <li key={idx} className="p-3 rounded-lg hover:bg-manager/5 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className="shrink-0 mt-0.5">
                              {item.type === 'status_change' ? (
                                <FileText className="h-4 w-4 text-manager" strokeWidth={1.5} />
                              ) : (
                                <Activity className="h-4 w-4 text-manager" strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-sans text-sm text-foreground">
                                <span className="font-semibold text-manager">{item.recruiter_name}</span>
                                {item.type === 'status_change' ? ' moved ' : ' updated '}
                                <span className="font-medium">{item.candidate_name}</span>
                                {item.type === 'status_change' ? ' to ' : ' → '}
                                <span className="font-medium">{item.label}</span>
                                <span className="text-muted-foreground"> · {item.job_title}</span>
                              </p>
                              <p className="text-xs text-muted-foreground font-sans mt-0.5">{formatRelativeTime(item.at)}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-manager/10">
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium">
                <Link to="/manager/team">View team <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} /></Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium">
                <Link to="/manager/audit-logs">View audit log <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} /></Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Needs attention — jobs */}
        <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-manager/20">
          <div className="border-b border-manager/10 bg-manager/5 px-6 py-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-manager" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-semibold text-foreground">Needs attention</h2>
          </div>
          <div className="p-4 max-h-[280px] overflow-y-auto">
            {needsAttentionJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground font-sans py-6 text-center">No jobs need attention. All published jobs have recent activity.</p>
            ) : (
              <ul className="space-y-2">
                {needsAttentionJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/manager/jobs`}
                      className="block p-3 rounded-lg border border-border hover:border-manager/30 hover:bg-manager/5 transition-all group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-medium text-foreground group-hover:text-manager transition-colors truncate">{job.title}</span>
                        <Badge variant="outline" className="shrink-0 text-xs font-sans border-border bg-muted/30">{job.applications_count} apps</Badge>
                      </div>
                      {job.recruiter_name && (
                        <p className="text-xs text-muted-foreground font-sans mt-1 truncate">{job.recruiter_name}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {needsAttentionJobs.length > 0 && (
            <div className="px-6 pb-4">
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium">
                <Link to="/manager/jobs">View all jobs <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} /></Link>
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Invite Codes & Team */}
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
                <Key className="h-5 w-5 text-manager" strokeWidth={1.5} />
                Invite Codes
              </h2>
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
                <div className="flex flex-row items-center justify-between pb-4 border-b border-manager/10 bg-manager/5 -mx-6 px-6 -mt-6 mb-4 rounded-t-xl">
                  <div className="space-y-1">
                    <h3 className="text-base font-display font-medium text-foreground">
                      Active Invitations
                    </h3>
                    <p className="text-sm text-muted-foreground font-sans">Manage codes for candidate access.</p>
                  </div>
                  <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm" className="rounded-lg border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                    {isCreatingCode ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <><Plus className="h-4 w-4 mr-1" strokeWidth={1.5} /> Create</>}
                  </Button>
                </div>
                <div>
                  {inviteCodes.length === 0 ? (
                    <p className="text-sm p-4 text-center text-muted-foreground font-sans">No codes yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {inviteCodes.slice(0, 5).map((code) => (
                        <div key={code.id} className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-manager/5 transition-all flex items-center justify-between group">
                          <code className="font-mono text-lg font-bold text-manager tracking-wider">{code.code}</code>
                          <div className="flex items-center gap-3">
                            <Badge variant={code.is_active ? "default" : "secondary"} className={`font-sans ${code.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}`}>
                              {code.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <div className="text-xs text-muted-foreground font-sans">{code.uses_count} uses</div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-manager/20 hover:text-manager" onClick={() => copyCode(code.code)}>
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

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
                  <Users className="h-5 w-5 text-manager" strokeWidth={1.5} />
                  Your Team
                </h2>
                <Button variant="link" size="sm" asChild className="rounded-lg text-manager hover:text-manager/80 hover:bg-manager/10 font-sans">
                  <Link to="/manager/team">View All <ArrowRight className="ml-1 h-3 w-3" strokeWidth={1.5} /></Link>
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
                {teamMembers.length === 0 ? (
                  <p className="text-sm p-6 text-center text-muted-foreground font-sans">No team members found.</p>
                ) : (
                  <div className="space-y-3">
                    {teamMembers.slice(0, 5).map((member) => (
                      <div key={member.id} className="p-3 rounded-xl border border-border hover:bg-manager/5 transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-manager/10 text-manager flex items-center justify-center font-bold text-sm border border-manager/20 font-sans">
                            {member.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-sans font-medium text-sm">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground font-sans">{member.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs font-sans border-border bg-muted/30">
                          {member.role === 'recruiter' ? 'Recruiter' :
                            member.role === 'account_manager' ? 'Manager' : member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Applications */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
                <Clock className="h-5 w-5 text-manager" strokeWidth={1.5} />
                Latest Applications
              </h2>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 h-full min-h-[250px]">
              {recentApplications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground font-sans p-12">
                  <div className="h-12 w-12 rounded-full bg-manager/10 border border-manager/20 flex items-center justify-center mb-4">
                    <Clock className="h-6 w-6 text-manager opacity-60" strokeWidth={1.5} />
                  </div>
                  <p>No recent applications.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentApplications.map((app) => (
                    <div key={app.id} className="p-4 rounded-xl border border-border hover:bg-manager/5 transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-manager/10 text-manager flex items-center justify-center font-bold border border-manager/20 group-hover:bg-manager/20 transition-colors">
                          <Award className="h-5 w-5" strokeWidth={1.5} />
                        </div>
                        <div>
                          <p className="font-sans font-semibold group-hover:text-manager transition-colors text-sm">{app.candidate_name}</p>
                          <p className="text-sm text-muted-foreground font-sans flex items-center gap-1">
                            <Briefcase className="h-3 w-3" strokeWidth={1.5} />
                            {app.job_title}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <Badge variant="outline" className={`mb-1 font-sans ${app.status === 'applied' ? 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                          app.status === 'hired' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' :
                            'border-border bg-muted/30'
                          }`}>
                          {app.status}
                        </Badge>
                        <div className="text-xs text-muted-foreground font-sans">{formatDate(app.applied_at)}</div>
                      </div>
                    </div>
                  ))}
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