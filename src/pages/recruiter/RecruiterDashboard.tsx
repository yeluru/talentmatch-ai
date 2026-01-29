import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';

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
  candidate_name: string;
  job_title: string;
  applied_at: string;
}

export default function RecruiterDashboard() {
  const { roles, organizationId } = useAuth();
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
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }
  }, [orgId]);

  const fetchDashboardData = async () => {
    if (!orgId) return;
    
    try {
      // Fetch jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('organization_id', orgId);
      
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
            'Candidate';

          appsList.push({
            id: app.id,
            candidate_name: name,
            job_title: (app.jobs as any)?.title || 'Job',
            applied_at: app.applied_at,
          });
        });
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

  const ActionCard = ({
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(href);
        }
      }}
      className="card-elevated p-4 md:p-5 cursor-pointer hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold truncate">{title}</div>
              {badge ? (
                <Badge variant="secondary" className="bg-accent/10 text-accent">
                  {badge}
                </Badge>
              ) : null}
            </div>
            <div className="text-smline-clamp-2">{description}</div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4mt-1 shrink-0" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={
            <>
              Recruiter <span className="text-accent">Dashboard</span>
            </>
          }
          description="Post jobs, track applicants, and prioritize the best-fit candidates—fast."
          actions={
            <Button asChild className="btn-glow">
              <Link to="/recruiter/jobs/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Post a Job
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Bulk upload profiles"
            value={stats.sourcedResumeUploads.toString()}
            icon={Upload}
            href="/recruiter/talent-search/uploads"
          />
          <StatCard
            title="LinkedIn search imports"
            value={stats.sourcedGoogleXray.toString()}
            icon={Globe}
            href="/recruiter/talent-search/search"
          />
          <StatCard
            title="Web search imports"
            value={stats.sourcedWebSearch.toString()}
            icon={Search}
            href="/recruiter/talent-search/search"
          />
        </div>

        {/* Journey: quick actions */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Start here</h2>
              <p className="text-sm">
                Jump into the most common recruiter workflows with one click.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruiter/insights">
                View Insights <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ActionCard
              title="My Jobs"
              description="Create and manage job postings."
              href="/recruiter/jobs"
              icon={Briefcase}
              badge={stats.openJobs ? `${stats.openJobs} open` : undefined}
            />
            <ActionCard
              title="My Applicants"
              description="Review applicants and update statuses."
              href="/recruiter/candidates"
              icon={ClipboardList}
              badge={stats.totalApplications ? `${stats.totalApplications}` : undefined}
            />
            <ActionCard
              title="Candidate Pipeline"
              description="Move candidates through stages and stay organized."
              href="/recruiter/pipeline"
              icon={GitBranch}
            />
            <ActionCard
              title="Interview Schedule"
              description="Schedule interviews for candidates in your pipeline."
              href="/recruiter/interviews"
              icon={CalendarDays}
            />
            <ActionCard
              title="Shortlists"
              description="Curate candidate lists for quick review and sharing."
              href="/recruiter/shortlists"
              icon={Layers}
            />
            <ActionCard
              title="ATS Match Search"
              description="Search by ATS match and shortlist strong profiles."
              href="/recruiter/ats-match-search"
              icon={Search}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Invite Codes */}
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Invite Candidates
                </CardTitle>
                <CardDescription>Share codes to invite candidates to your organization</CardDescription>
              </div>
              <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm">
                {isCreatingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" /> New
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              {inviteCodes.length === 0 ? (
                <p className="text-sm">Create an invite code to start inviting candidates.</p>
              ) : (
                <div className="space-y-2">
                  {inviteCodes.map((code) => (
                    <div key={code.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <code className="font-mono font-bold">{code.code}</code>
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{code.uses_count} uses</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyCode(code.code)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Recommended next steps
              </CardTitle>
              <CardDescription>Based on what’s happening in your org right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recommendations.map((r, idx) => (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(r.href)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(r.href);
                      }
                    }}
                    className="flex items-start gap-3 p-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                      <r.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-sm">{r.description}</div>
                    </div>
                    <ArrowRight className="h-4 w-4mt-1 shrink-0" />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <Button asChild variant="secondary">
                  <Link to="/recruiter/ai-matching">
                    Run Matching <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/recruiter/insights">
                    Open Insights <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Applications */}
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent applications
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruiter/candidates">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentApplications.length === 0 ? (
              <p className="text-sm">No applications yet. Post a job to start receiving applications.</p>
            ) : (
              <div className="space-y-3">
                {recentApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{app.candidate_name}</p>
                      <p className="text-sm">Applied for: {app.job_title}</p>
                    </div>
                    <span className="text-sm">{formatDate(app.applied_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}