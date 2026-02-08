import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Users, Search, UserCircle } from 'lucide-react';
import { ApplicantDetailSheet } from '@/components/recruiter/ApplicantDetailSheet';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';
import { getApplicationStatusLabel, APPLICATION_STAGE_OPTIONS, getStatusValuesForStage } from '@/lib/statusOptions';
import type { ApplicationStage } from '@/lib/statusOptions';

interface AppRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string | null;
  outcome: string | null;
  applied_at: string;
  job_title: string;
  recruiter_id: string | null;
  candidate_name: string;
  recruiter_notes: string | null;
}

export default function ManagerCandidates() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ['manager-jobs-for-candidates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  const { data: applications, isLoading } = useQuery({
    queryKey: ['manager-candidates', organizationId, jobFilter, statusFilter],
    queryFn: async (): Promise<AppRow[]> => {
      if (!organizationId) return [];
      let q = supabase
        .from('applications')
        .select(`
          id,
          candidate_id,
          job_id,
          status,
          outcome,
          applied_at,
          jobs!inner(id, title, recruiter_id)
        `)
        .eq('jobs.organization_id', organizationId)
        .order('applied_at', { ascending: false });
      if (jobFilter !== 'all') q = q.eq('job_id', jobFilter);
      if (statusFilter !== 'all') {
        const statusValues = getStatusValuesForStage(statusFilter as ApplicationStage);
        q = q.in('status', statusValues);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as { id: string; candidate_id: string; job_id: string; status: string | null; outcome: string | null; applied_at: string; jobs: { id: string; title: string; recruiter_id: string | null } }[];
      const candidateIds = [...new Set(rows.map((r) => r.candidate_id))];
      if (candidateIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('id, full_name, recruiter_notes')
        .in('id', candidateIds);
      const nameByCandidate: Record<string, string> = {};
      const notesByCandidate: Record<string, string | null> = {};
      (profiles ?? []).forEach((p: { id: string; full_name: string | null; recruiter_notes: string | null }) => {
        nameByCandidate[p.id] = (p.full_name || '').trim() || 'Applicant';
        notesByCandidate[p.id] = p.recruiter_notes ?? null;
      });
      return rows.map((r) => ({
        id: r.id,
        candidate_id: r.candidate_id,
        job_id: r.job_id,
        status: r.status,
        outcome: r.outcome ?? null,
        applied_at: r.applied_at,
        job_title: r.jobs?.title ?? 'Job',
        recruiter_id: r.jobs?.recruiter_id ?? null,
        candidate_name: nameByCandidate[r.candidate_id] ?? 'Applicant',
        recruiter_notes: notesByCandidate[r.candidate_id] ?? null,
      }));
    },
    enabled: !!organizationId,
  });

  const filtered = (applications ?? []).filter((row) => {
    const matchesSearch =
      row.candidate_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.job_title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const byJob = filtered.reduce<Record<string, AppRow[]>>((acc, row) => {
    const key = row.job_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const jobIdsOrdered = [...new Set(filtered.map((r) => r.job_id))];
  const jobTitleById = Object.fromEntries((jobs ?? []).map((j) => [j.id, j.title]));
  jobIdsOrdered.sort((a, b) => (jobTitleById[a] ?? '').localeCompare(jobTitleById[b] ?? ''));

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto p-6">
          <p className="text-muted-foreground font-sans">Your account manager role is not linked to an organization.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  <span className="text-gradient-manager">Candidates</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Everyone who has applied to a job in your organization.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 rounded-xl border border-border bg-card p-3 w-full">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <Input
                  placeholder="Search by name or job..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans w-full"
                />
              </div>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger className="w-full min-w-[180px] h-11 rounded-lg border-border bg-background font-sans">
                  <SelectValue placeholder="All Jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  {jobs?.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full min-w-[160px] h-11 rounded-lg border-border bg-background font-sans">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {APPLICATION_STAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <EmptyState
                  icon={Users}
                  title="No candidates found"
                  description={applications?.length ? 'Try adjusting your filters.' : 'No one has applied to your jobs yet.'}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {jobIdsOrdered.map((jobId) => {
                  const rows = byJob[jobId] ?? [];
                  const title = jobTitleById[jobId] ?? rows[0]?.job_title ?? 'Job';
                  return (
                    <div key={jobId} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <span className="font-semibold text-foreground">{title}</span>
                        <span className="ml-2 text-sm text-muted-foreground font-sans">
                          ({rows.length} {rows.length === 1 ? 'applicant' : 'applicants'})
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm font-sans">
                          <thead>
                            <tr className="border-b border-border bg-muted/20">
                              <th className="text-left p-3 font-semibold text-foreground">Candidate</th>
                              <th className="text-left p-3 font-semibold text-foreground">Status</th>
                              <th className="text-left p-3 font-semibold text-foreground">Comments</th>
                              <th className="text-left p-3 font-semibold text-foreground">Applied</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-manager/5 transition-colors">
                                <td className="p-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedApplicationId(row.id);
                                      setDetailOpen(true);
                                    }}
                                    className="flex items-center gap-2 text-left rounded-md hover:bg-manager/10 focus:outline-none focus:ring-2 focus:ring-manager/30 -m-1 p-1 w-full"
                                  >
                                    <div className="h-8 w-8 rounded-full bg-manager/10 text-manager border border-manager/20 flex items-center justify-center shrink-0">
                                      <UserCircle className="h-4 w-4" strokeWidth={1.5} />
                                    </div>
                                    <span className="font-medium text-manager hover:underline">{row.candidate_name}</span>
                                  </button>
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline" className="font-sans">
                                    {getApplicationStatusLabel(row.status, row.outcome)}
                                  </Badge>
                                </td>
                                <td className="p-3 text-muted-foreground font-sans max-w-[240px]">
                                  {row.recruiter_notes?.trim() ? (
                                    <span className="line-clamp-2" title={row.recruiter_notes}>
                                      {row.recruiter_notes}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/70">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-muted-foreground font-sans">
                                  {format(new Date(row.applied_at), 'MMM d, yyyy')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
        <ApplicantDetailSheet
          applicationId={selectedApplicationId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
    </DashboardLayout>
  );
}
