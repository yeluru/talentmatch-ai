import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import {
  Briefcase,
  Users,
  Sparkles,
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
  Search,
  Megaphone,
  Upload,
  Globe,
  TrendingUp,
  LayoutDashboard,
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
  sourcedResumeUploads: number;
  sourcedGoogleXray: number;
  sourcedWebSearch: number;
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
}

export default function RecruiterDashboard() {
  const { roles, organizationId, user, currentRole } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const [stats, setStats] = useState<RecruiterStats>({
    openJobs: 0,
    totalApplications: 0,
    totalCandidates: 0,
    sourcedResumeUploads: 0,
    sourcedGoogleXray: 0,
    sourcedWebSearch: 0,
  });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
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
      let jobsQuery = supabase.from('jobs').select('id, status').eq('organization_id', orgId);
      if (effectiveOwnerId) jobsQuery = jobsQuery.eq('recruiter_id', effectiveOwnerId);
      const { data: jobs } = await jobsQuery;

      const openJobs = jobs?.filter(j => j.status === 'published').length || 0;
      const jobIds = jobs?.map(j => j.id) || [];

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

        // Recent applications list
        const { data: applications } = await supabase
          .from('applications')
          .select(`
            id, applied_at, candidate_id,
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

      // Fetch candidates in org
      const { data: links } = await supabase
        .from('candidate_org_links')
        .select('candidate_id')
        .eq('organization_id', orgId)
        .eq('status', 'active');
      const candidateIds = Array.from(new Set((links || []).map((l: any) => String(l.candidate_id)).filter(Boolean)));

      // Talent sourcing counters (distinct candidates by source)
      const [resumeCount, googleCount, webCount] = await Promise.all([
        supabase
          .from('candidate_org_links')
          .select('candidate_id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .eq('link_type', 'resume_upload'),
        supabase
          .from('candidate_org_links')
          .select('candidate_id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .eq('link_type', 'google_xray'),
        supabase
          .from('candidate_org_links')
          .select('candidate_id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .eq('link_type', 'web_search'),
      ]);

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
        sourcedResumeUploads: resumeCount.count || 0,
        sourcedGoogleXray: googleCount.count || 0,
        sourcedWebSearch: webCount.count || 0,
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

  const recommendations = useMemo(() => {
    const recs: Array<{ title: string; description: string; href: string; icon: any }> = [];
    if (stats.openJobs === 0) {
      recs.push({
        title: 'Post your first job',
        description: 'Create a job so candidates can apply and your pipeline starts flowing.',
        href: '/recruiter/jobs/new',
        icon: PlusCircle,
      });
    } else if (stats.totalApplications === 0) {
      recs.push({
        title: 'Share your job posting',
        description: 'Publish and promote your job to start receiving applicants.',
        href: '/recruiter/jobs',
        icon: Megaphone,
      });
    } else {
      recs.push({
        title: 'Review new applicants',
        description: 'Triage and move applicants into Screening or Interviewing.',
        href: '/recruiter/candidates',
        icon: ClipboardList,
      });
      recs.push({
        title: 'Keep your pipeline moving',
        description: 'Drag/drop candidates across stages to maintain momentum.',
        href: '/recruiter/pipeline',
        icon: GitBranch,
      });
    }

    if (stats.totalCandidates === 0) {
      recs.push({
        title: 'Build your talent pool',
        description: 'Invite or upload candidates so you can shortlist and match instantly.',
        href: '/recruiter/talent-pool',
        icon: Users,
      });
    } else {
      recs.push({
        title: 'Run matching against a job',
        description: 'Rank your talent pool or applicants against a job in seconds.',
        href: '/recruiter/ai-matching',
        icon: Sparkles,
      });
    }

    return recs.slice(0, 4);
  }, [stats.openJobs, stats.totalApplications, stats.totalCandidates]);




  const ActionCardPremium = ({
    title,
    description,
    href,
    icon: Icon,
    badge,
  }: {
    title: string;
    description: string;
    href: string;
    icon: any;
    badge?: string;
  }) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(href)}
      className="rounded-xl border border-border bg-card p-5 cursor-pointer transition-all duration-300 hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-display font-semibold truncate group-hover:text-recruiter transition-colors">{title}</div>
              {badge ? (
                <Badge variant="secondary" className="bg-recruiter/20 text-recruiter border-recruiter/20 font-sans">
                  {badge}
                </Badge>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground font-sans line-clamp-2 mt-1">{description}</div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground group-hover:text-recruiter transition-colors" strokeWidth={1.5} />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
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
                Overview of your hiring pipeline and sourcing activities.
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

        {/* Stats Grid */}
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Bulk Uploads"
            value={stats.sourcedResumeUploads.toString()}
            icon={Upload}
            iconColor="text-recruiter"
            change="Total processed"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20"
          />
          <StatCard
            title="LinkedIn Imports"
            value={stats.sourcedGoogleXray.toString()}
            icon={Globe}
            iconColor="text-recruiter"
            change="X-Ray Search"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20"
          />
          <StatCard
            title="Web Imports"
            value={stats.sourcedWebSearch.toString()}
            icon={Search}
            iconColor="text-recruiter"
            change="Web Sourced"
            changeType="neutral"
            className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-recruiter/20"
          />
        </div>

        {/* Quick Actions Grid */}
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2 text-foreground">
                <Sparkles className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                Quick Actions
              </h2>
              <p className="text-sm text-muted-foreground font-sans">Jump into your most common workflows.</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="rounded-lg text-recruiter hover:text-recruiter/80 hover:bg-recruiter/10 font-sans">
              <Link to="/recruiter/insights">
                View Insights <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ActionCardPremium
              title="My Jobs"
              description="Create and manage job postings."
              href="/recruiter/jobs"
              icon={Briefcase}
              badge={stats.openJobs ? `${stats.openJobs} open` : undefined}
            />
            <ActionCardPremium
              title="My Applicants"
              description="Review applicants and update statuses."
              href="/recruiter/candidates"
              icon={ClipboardList}
              badge={stats.totalApplications ? `${stats.totalApplications}` : undefined}
            />
            <ActionCardPremium
              title="Candidate Pipeline"
              description="Move candidates through stages."
              href="/recruiter/pipeline"
              icon={GitBranch}
            />
            <ActionCardPremium
              title="Interview Schedule"
              description="Manage upcoming interviews."
              href="/recruiter/interviews"
              icon={CalendarDays}
            />
            <ActionCardPremium
              title="ATS Match Search"
              description="Find best fits in your database."
              href="/recruiter/ats-match-search"
              icon={Search}
            />
            <ActionCardPremium
              title="Shortlists"
              description="Curated candidate lists."
              href="/recruiter/shortlists"
              icon={Layers}
            />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
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
                    Active Codes
                  </h3>
                  <p className="text-sm text-muted-foreground font-sans">Share these to invite talent.</p>
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