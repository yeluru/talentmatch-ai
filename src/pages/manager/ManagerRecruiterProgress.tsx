import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ArrowUpRight, Users, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

import { applicationStageColumnKey, PIPELINE_STAGE_ORDER, type ApplicationStage, type FinalOutcome } from '@/lib/statusOptions';

// Unified pipeline stages (7 stages matching current design)
const PIPELINE_STAGES: ApplicationStage[] = PIPELINE_STAGE_ORDER;

// Final outcomes (shown separately from pipeline stages)
const FINAL_OUTCOMES: FinalOutcome[] = ['hired', 'job_offered', 'client_rejected', 'candidate_declined', 'withdrawn'];

type ApplicationRow = {
  id: string;
  status: string;
  outcome: string | null;
  updated_at: string;
  candidate_id: string;
  job_id: string;
  candidate_profiles: { full_name: string | null } | null;
  jobs: { title: string } | null;
};

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

  // Fetch recruiter's jobs
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

  // Fetch applications on recruiter's jobs (with ownership filtering)
  const { data: applications, isLoading } = useQuery({
    queryKey: ['recruiter-applications-for-progress', recruiterJobIds, recruiterUserId],
    queryFn: async (): Promise<ApplicationRow[]> => {
      if (recruiterJobIds.length === 0) return [];

      // Try with outcome field first
      let query = supabase
        .from('applications')
        .select(`
          id, status, outcome, updated_at, candidate_id, job_id,
          candidate_profiles:candidate_id(full_name),
          jobs:job_id(title, recruiter_id)
        `)
        .in('job_id', recruiterJobIds)
        .order('updated_at', { ascending: false })
        .limit(200);

      let result = await query;

      // Fallback if outcome column doesn't exist
      if (result.error && (result.error.message?.includes('outcome') || result.error.code === '42703')) {
        query = supabase
          .from('applications')
          .select(`
            id, status, updated_at, candidate_id, job_id,
            candidate_profiles:candidate_id(full_name),
            jobs:job_id(title, recruiter_id)
          `)
          .in('job_id', recruiterJobIds)
          .order('updated_at', { ascending: false })
          .limit(200);
        result = await query;
      }

      if (result.error) throw result.error;
      let apps = (result.data || []) as any[];

      // Filter by engagement ownership (same logic as recruiter's pipeline view)
      if (recruiterUserId && recruiterJobIds.length > 0) {
        const { data: engagements } = await supabase
          .from('candidate_engagements')
          .select('job_id, candidate_id, owner_user_id')
          .in('job_id', recruiterJobIds);

        const engagementOwnerByKey = new Map<string, string>(
          (engagements ?? []).map((e: any) => [
            `${e.job_id},${e.candidate_id}`,
            e.owner_user_id ?? '',
          ])
        );

        apps = apps.filter((app: any) => {
          const key = `${app.job_id},${app.candidate_id}`;
          const engagementOwner = engagementOwnerByKey.get(key);

          // If engagement exists with owner, check if it matches this recruiter
          if (engagementOwner != null && engagementOwner !== '') {
            return engagementOwner === recruiterUserId;
          }

          // Otherwise, check if job's recruiter_id matches
          return app.jobs?.recruiter_id === recruiterUserId;
        });
      }

      return apps;
    },
    enabled: recruiterJobIds.length > 0,
  });

  // Count by pipeline stage (combining outreach + applied into one)
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'engaged_applied': 0, // Combined outreach + applied
      'rtr_rate': 0,
      'document_check': 0,
      'screening': 0,
      'submission': 0,
      'final_update': 0,
    };

    (applications || []).forEach((app) => {
      const stage = applicationStageColumnKey(app.status) ?? (app.status as ApplicationStage);

      // Combine outreach and applied
      if (stage === 'outreach' || stage === 'applied') {
        counts['engaged_applied']++;
      } else if (stage && counts.hasOwnProperty(stage)) {
        counts[stage]++;
      }
    });

    return counts;
  }, [applications]);

  // Count outcomes separately (within final_update stage)
  const outcomeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'hired': 0,
      'job_offered': 0,
      'client_rejected': 0,
      'candidate_declined': 0,
      'withdrawn': 0,
    };

    (applications || []).forEach((app) => {
      const stage = applicationStageColumnKey(app.status) ?? app.status;
      if (stage === 'final_update' && app.outcome) {
        const outcome = app.outcome.toLowerCase();
        if (counts.hasOwnProperty(outcome)) {
          counts[outcome]++;
        }
      }
    });

    return counts;
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
            {/* Pipeline Breakdown */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Pipeline Breakdown</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Candidates in each pipeline stage for this recruiter&apos;s jobs.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Engaged/Applied
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['engaged_applied'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    RTR & Rate
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['rtr_rate'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Document Check
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['document_check'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Screening
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['screening'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Submission
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['submission'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Outcome
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{stageCounts['final_update'] ?? 0}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild className="rounded-lg text-manager hover:bg-manager/10 font-sans font-medium mt-4">
                <Link to={`/recruiter/pipeline?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
                  Open Full Pipeline <ArrowUpRight className="ml-1 h-3 w-3 inline" strokeWidth={1.5} />
                </Link>
              </Button>
            </section>

            {/* Outcomes */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Outcomes</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Final outcomes for candidates who reached the outcome stage.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="rounded-xl border border-border bg-success/10 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-success/30">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Hired
                  </p>
                  <p className="text-2xl font-display font-bold text-success tabular-nums">{outcomeCounts['hired'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-green-500/10 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-green-500/30">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Job Offered
                  </p>
                  <p className="text-2xl font-display font-bold text-green-600 dark:text-green-400 tabular-nums">{outcomeCounts['job_offered'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-destructive/10 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-destructive/30">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Client Rejected
                  </p>
                  <p className="text-2xl font-display font-bold text-destructive tabular-nums">{outcomeCounts['client_rejected'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-orange-500/10 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-orange-500/30">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Candidate Declined
                  </p>
                  <p className="text-2xl font-display font-bold text-orange-600 dark:text-orange-400 tabular-nums">{outcomeCounts['candidate_declined'] ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4 min-h-[88px] flex flex-col justify-center transition-all duration-300 hover:border-manager/20">
                  <p className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Withdrawn
                  </p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{outcomeCounts['withdrawn'] ?? 0}</p>
                </div>
              </div>
            </section>

            {/* Recent Activity */}
            <section className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-5 w-5 text-manager shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-bold text-foreground">Recent Activity</h2>
              </div>
              <p className="text-sm text-muted-foreground font-sans mb-4">
                Latest applications on this recruiter&apos;s jobs.
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-manager" strokeWidth={1.5} />
                </div>
              ) : (applications || []).length === 0 ? (
                <p className="text-sm font-sans text-muted-foreground py-6">No applications yet.</p>
              ) : (
                <ul className="space-y-3">
                  {(applications || []).slice(0, 10).map((app) => {
                    const stage = applicationStageColumnKey(app.status) ?? app.status;
                    const stageLabel = stage === 'outreach' || stage === 'applied' ? 'Engaged/Applied' :
                                      stage === 'rtr_rate' ? 'RTR & Rate' :
                                      stage === 'document_check' ? 'Document Check' :
                                      stage === 'final_update' && app.outcome ? app.outcome.replace(/_/g, ' ') :
                                      String(stage || '').replace(/_/g, ' ');

                    return (
                      <li key={app.id}>
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 bg-muted/30 hover:bg-manager/5 hover:border-manager/20 transition-all">
                          <div className="min-w-0 flex-1">
                            <p className="font-sans font-medium text-foreground truncate">{app.candidate_profiles?.full_name || 'Candidate'}</p>
                            <p className="text-sm font-sans text-muted-foreground truncate mt-0.5">
                              {app.jobs?.title ?? 'No job'} · {new Date(app.updated_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 font-sans text-xs border-manager/20 bg-manager/10 text-manager capitalize">
                            {stageLabel}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

