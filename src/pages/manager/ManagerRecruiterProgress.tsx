import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ArrowUpRight, Users, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const APP_STATUS_ORDER = ['applied', 'reviewing', 'screening', 'interview', 'offer', 'hired'];

type EngagementRow = {
  id: string;
  stage: string;
  updated_at: string;
  owner_user_id: string | null;
  candidate_profiles: { full_name: string | null } | null;
  jobs: { title: string } | null;
};

const STAGES = [
  'started',
  'outreach',
  'rate_confirmation',
  'right_to_represent',
  'screening',
  'submission',
  'interview',
  'offer',
  'onboarding',
  'closed',
];

export default function ManagerRecruiterProgress() {
  const { recruiterUserId } = useParams();
  const { organizationId, user } = useAuth();

  const { data: assignmentOk, isLoading: loadingAssign } = useQuery({
    queryKey: ['am-assignment-check', organizationId, user?.id, recruiterUserId],
    queryFn: async () => {
      if (!organizationId || !user?.id || !recruiterUserId) return false;
      const { data } = await supabase
        .from('account_manager_recruiter_assignments')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_manager_user_id', user.id)
        .eq('recruiter_user_id', recruiterUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!organizationId && !!user?.id && !!recruiterUserId,
  });

  const { data: recruiterProfile } = useQuery({
    queryKey: ['recruiter-profile', recruiterUserId],
    queryFn: async () => {
      if (!recruiterUserId) return null;
      const { data } = await supabase.from('profiles').select('full_name, email').eq('user_id', recruiterUserId).maybeSingle();
      return data as any;
    },
    enabled: !!recruiterUserId && !!assignmentOk,
  });

  const { data: engagements, isLoading } = useQuery({
    queryKey: ['recruiter-engagements-by-owner', organizationId, recruiterUserId],
    queryFn: async (): Promise<EngagementRow[]> => {
      if (!organizationId || !recruiterUserId) return [];
      const { data, error } = await supabase
        .from('candidate_engagements')
        .select(
          `
          id, stage, updated_at, owner_user_id,
          candidate_profiles:candidate_id(full_name),
          jobs:job_id(title)
        `
        )
        .eq('organization_id', organizationId)
        .eq('owner_user_id', recruiterUserId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!organizationId && !!recruiterUserId && !!assignmentOk,
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    STAGES.forEach((s) => (map[s] = 0));
    (engagements || []).forEach((e) => {
      const k = String(e.stage || 'started');
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [engagements]);

  // Application pipeline: jobs owned by this recruiter, applications by status
  const { data: recruiterJobs } = useQuery({
    queryKey: ['recruiter-jobs-for-progress', organizationId, recruiterUserId],
    queryFn: async () => {
      if (!organizationId || !recruiterUserId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('recruiter_id', recruiterUserId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!recruiterUserId && !!assignmentOk,
  });
  const recruiterJobIds = (recruiterJobs || []).map((j: { id: string }) => j.id);

  const { data: applications } = useQuery({
    queryKey: ['recruiter-applications-by-status', recruiterJobIds],
    queryFn: async () => {
      if (recruiterJobIds.length === 0) return [];
      const { data, error } = await supabase
        .from('applications')
        .select('id, status')
        .in('job_id', recruiterJobIds);
      if (error) throw error;
      return (data || []) as { id: string; status: string }[];
    },
    enabled: recruiterJobIds.length > 0,
  });
  const appByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    APP_STATUS_ORDER.forEach((s) => (map[s] = 0));
    (applications || []).forEach((a) => {
      const s = a.status || 'applied';
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [applications]);

  if (loadingAssign) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!assignmentOk) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Recruiter <span className="text-gradient-manager">Progress</span></h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">This recruiter is not assigned to your account.</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-2xl">
                <Button asChild variant="outline" className="rounded-lg border-manager/20 hover:bg-manager/10 text-manager font-sans font-semibold">
                  <Link to="/manager/team">
                    <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Back to Team
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <Button asChild variant="ghost" size="sm" className="rounded-lg -ml-2 text-muted-foreground hover:text-manager hover:bg-manager/5 font-sans shrink-0">
                  <Link to="/manager/team">
                    <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Team
                  </Link>
                </Button>
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20 shrink-0">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground truncate">
                  {recruiterProfile?.full_name || 'Recruiter'} · <span className="text-gradient-manager">Progress</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">{recruiterProfile?.email || ''}</p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Button asChild className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                <Link to={`/recruiter/engagements?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                  Open {recruiterProfile?.full_name || 'Recruiter'}'s Engagement Pipeline
                  <ArrowUpRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-lg h-11 px-6 border-manager/20 hover:bg-manager/10 text-manager font-sans font-semibold">
                <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                  Open {recruiterProfile?.full_name || 'Recruiter'}'s Application Pipeline
                  <ArrowUpRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Application pipeline */}
        <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-manager" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-bold text-foreground">Application pipeline</h2>
          </div>
          <p className="text-sm text-muted-foreground font-sans mb-4">Applications on {recruiterProfile?.full_name || 'this recruiter'}'s jobs by status.</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {APP_STATUS_ORDER.map((s) => (
              <div key={s} className="rounded-xl border border-border bg-muted/30 p-4 transition-all duration-300 hover:border-manager/20">
                <p className="text-sm font-sans font-medium text-muted-foreground capitalize mb-1">{s.replace(/_/g, ' ')}</p>
                <div className="text-2xl font-display font-bold text-foreground">{appByStatus[s] || 0}</div>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium mt-4">
            <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
              Open full Application Pipeline <ArrowUpRight className="ml-1 h-3 w-3" strokeWidth={1.5} />
            </Link>
          </Button>
        </div>

        {/* Engagement pipeline stages */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map((s) => (
            <div key={s} className="rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-manager/20">
              <p className="text-sm font-sans font-medium text-muted-foreground capitalize mb-2">{s.replaceAll('_', ' ')}</p>
              <div className="text-2xl font-display font-bold text-foreground">{counts[s] || 0}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-manager" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-bold text-foreground">Recent engagements</h2>
          </div>
          <p className="text-sm text-muted-foreground font-sans mb-4">Latest 200 engagements owned by this recruiter.</p>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-manager" strokeWidth={1.5} />
            </div>
          ) : (
            <div className="space-y-2">
              {(engagements || []).length === 0 ? (
                <div className="text-sm font-sans text-muted-foreground">No engagements yet.</div>
              ) : (
                (engagements || []).map((e) => (
                  <div key={e.id} className="group flex items-center justify-between rounded-xl border border-border p-3 bg-muted/30 hover:bg-manager/5 hover:border-manager/30 hover:shadow-md transition-all">
                    <div className="min-w-0">
                      <div className="font-sans font-medium truncate">{e.candidate_profiles?.full_name || 'Candidate'}</div>
                      <div className="text-sm font-sans text-muted-foreground truncate">
                        {e.jobs?.title ? e.jobs.title : 'No job'} · Updated {new Date(e.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 font-sans border-manager/20 bg-manager/10 text-manager">
                      {String(e.stage || 'started').replaceAll('_', ' ')}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

