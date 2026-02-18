import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ArrowUpRight, Users, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

import { applicationStageColumnKey } from '@/lib/statusOptions';

const APP_STATUS_ORDER = ['outreach', 'applied', 'rtr_rate', 'document_check', 'screening', 'submission', 'client_shortlist', 'client_interview', 'offered', 'hired'];

type EngagementRow = {
  id: string;
  stage: string;
  updated_at: string;
  owner_user_id: string | null;
  candidate_profiles: { full_name: string | null } | null;
  jobs: { title: string } | null;
};

const STAGES = ['outreach', 'applied', 'rtr_rate', 'document_check', 'screening', 'submission', 'client_shortlist', 'client_interview', 'offered', 'hired', 'rejected', 'withdrawn'];

export default function ManagerRecruiterProgress() {
  const { recruiterUserId } = useParams();
  const { organizationId, user } = useAuth();

  const { data: assignmentOk, isLoading: loadingAssign } = useQuery({
    queryKey: ['am-assignment-check', organizationId, user?.id, recruiterUserId],
    queryFn: async () => {
      if (!organizationId || !user?.id || !recruiterUserId) return false;

      // Check if this specific recruiter is assigned to this AM
      const { data: specificAssignment } = await supabase
        .from('account_manager_recruiter_assignments')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_manager_user_id', user.id)
        .eq('recruiter_user_id', recruiterUserId)
        .maybeSingle();

      if (specificAssignment) return true;

      // If no specific assignment, check if ANY assignments exist for this AM
      // If none exist (single-AM org), allow viewing all recruiters
      const { data: anyAssignments } = await supabase
        .from('account_manager_recruiter_assignments')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_manager_user_id', user.id)
        .limit(1)
        .maybeSingle();

      // If this AM has no assignments at all, allow viewing (single-AM fallback)
      return !anyAssignments;
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
      const k = applicationStageColumnKey(e.stage) ?? String(e.stage || 'outreach');
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
      const s = applicationStageColumnKey(a.status) ?? a.status ?? 'applied';
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
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 px-4 sm:px-6">
        {/* Header */}
        <div className="shrink-0 py-6">
          <div className="flex flex-col gap-4 sm:gap-6">
            <Button asChild variant="ghost" size="sm" className="rounded-lg -ml-2 w-fit text-muted-foreground hover:text-manager hover:bg-manager/5 font-sans">
              <Link to="/manager/team">
                <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Back to Team
              </Link>
            </Button>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20 shrink-0">
                    <Users className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground truncate">
                      {recruiterProfile?.full_name || 'Recruiter'}
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground font-sans truncate">{recruiterProfile?.email || ''}</p>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground font-sans md:ml-14">Recruiter progress overview</p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0 md:ml-4">
                <Button asChild className="rounded-lg h-11 px-5 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold text-sm whitespace-nowrap">
                  <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                    Pipeline
                    <ArrowUpRight className="h-4 w-4 ml-2 shrink-0" strokeWidth={1.5} />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-6">
          <div className="space-y-8">
            {/* Application pipeline */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Application pipeline</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Applications on this recruiter&apos;s jobs by status.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {APP_STATUS_ORDER.map((s) => (
                  <div
                    key={s}
                    className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20"
                  >
                    <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      {s.replace(/_/g, ' ')}
                    </p>
                    <p className="text-2xl font-display font-bold text-foreground tabular-nums">{appByStatus[s] ?? 0}</p>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium mt-4">
                <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                  Open full Application Pipeline <ArrowUpRight className="ml-1 h-3 w-3 inline" strokeWidth={1.5} />
                </Link>
              </Button>
            </section>

            {/* Engagement pipeline stages */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Engagement pipeline</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Candidates in each engagement stage (sourced by this recruiter).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {STAGES.map((s) => (
                  <div
                    key={s}
                    className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20"
                  >
                    <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      {s.replaceAll('_', ' ')}
                    </p>
                    <p className="text-2xl font-display font-bold text-foreground tabular-nums">{counts[s] ?? 0}</p>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium mt-4">
                <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                  Open full Pipeline <ArrowUpRight className="ml-1 h-3 w-3 inline" strokeWidth={1.5} />
                </Link>
              </Button>
            </section>

            {/* Recent engagements */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Recent engagements</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Latest engagements owned by this recruiter.
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-manager" strokeWidth={1.5} />
                </div>
              ) : (engagements || []).length === 0 ? (
                <p className="text-sm font-sans text-muted-foreground py-6">No engagements yet.</p>
              ) : (
                <ul className="space-y-3">
                  {(engagements || []).map((e) => (
                    <li key={e.id}>
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 bg-muted/30 hover:bg-manager/5 hover:border-manager/20 transition-all">
                        <div className="min-w-0 flex-1">
                          <p className="font-sans font-medium text-foreground truncate">{e.candidate_profiles?.full_name || 'Candidate'}</p>
                          <p className="text-sm font-sans text-muted-foreground truncate mt-0.5">
                            {e.jobs?.title ?? 'No job'} · {new Date(e.updated_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 font-sans text-xs border-manager/20 bg-manager/10 text-manager capitalize">
                          {String(e.stage || 'started').replaceAll('_', ' ')}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

