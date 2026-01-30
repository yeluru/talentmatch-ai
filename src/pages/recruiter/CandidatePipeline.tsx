import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, GripVertical, Users, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { applicationStageColumnKey } from '@/lib/statusOptions';
import { ApplicantDetailSheet } from '@/components/recruiter/ApplicantDetailSheet';

interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  applied_at: string;
  ai_match_score: number | null;
  candidate_profiles: {
    id: string;
    full_name: string | null;
    current_title: string | null;
    email: string | null;
  } | null;
  jobs: {
    id: string;
    title: string;
  } | null;
}

const PIPELINE_STAGES = [
  { id: 'applied', label: 'Applied', dot: 'bg-slate-500', border: 'border-slate-400/60' },
  { id: 'reviewing', label: 'Reviewing', dot: 'bg-blue-500', border: 'border-blue-500/40' },
  { id: 'screening', label: 'Screening', dot: 'bg-indigo-500', border: 'border-indigo-500/40' },
  { id: 'shortlisted', label: 'Shortlisted', dot: 'bg-purple-500', border: 'border-purple-500/40' },
  { id: 'interviewing', label: 'Interviewing', dot: 'bg-yellow-500', border: 'border-yellow-500/40' },
  { id: 'offered', label: 'Offered', dot: 'bg-green-500', border: 'border-green-500/40' },
  { id: 'hired', label: 'Hired', dot: 'bg-emerald-600', border: 'border-emerald-600/40' },
  { id: 'rejected', label: 'Rejected', dot: 'bg-red-500', border: 'border-red-500/40' },
  { id: 'withdrawn', label: 'Withdrawn', dot: 'bg-gray-500', border: 'border-gray-500/40' },
] as const;

export default function CandidatePipeline() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [draggedApp, setDraggedApp] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const organizationId = orgIdForRecruiterSuite(roles);

  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const { data: applications, isLoading, isFetching } = useQuery({
    queryKey: ['pipeline-applications', organizationId, selectedJob],
    queryFn: async () => {
      if (!organizationId) return [];
      let query = supabase
        .from('applications')
        .select(`
          id, candidate_id, job_id, status, applied_at, ai_match_score,
          candidate_profiles!inner(id, full_name, current_title, email),
          jobs!inner(id, title, organization_id)
        `)
        .eq('jobs.organization_id', organizationId)
        .order('applied_at', { ascending: false });

      if (selectedJob !== 'all') {
        query = query.eq('job_id', selectedJob);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Application[];
    },
    enabled: !!organizationId,
  });

  const selectedJobTitle =
    selectedJob === 'all'
      ? 'All Jobs'
      : (jobs || []).find((j: any) => String(j.id) === String(selectedJob))?.title || 'Selected Job';

  const totalVisible = applications?.length || 0;

  const updateStatus = useMutation({
    mutationFn: async ({ appId, status }: { appId: string; status: string }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', appId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['application-detail'], exact: false });
      toast.success('Candidate moved');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleDragStart = (e: React.DragEvent, appId: string) => {
    setDraggedApp(appId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedApp) {
      updateStatus.mutate({ appId: draggedApp, status });
      setDraggedApp(null);
    }
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedApp(null);
    setDragOverStage(null);
  };

  const getApplicationsByStatus = (status: string) => {
    return applications?.filter(app => applicationStageColumnKey(app.status) === status) || [];
  };

  const appsByStage = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const app of (applications || [])) {
      const k = applicationStageColumnKey(app.status);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(app);
    }
    return map;
  }, [applications]);

  const openApplication = (appId: string) => {
    setSelectedApplicationId(appId);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="font-display text-4xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <span className="text-gradient-premium">Candidate Pipeline</span>
            </h1>
            <p className="mt-2 text-muted-foreground text-lg">
              Manage and track candidate progress through stages.
            </p>
          </div>
          <Select value={selectedJob} onValueChange={(v) => setSelectedJob(String(v))}>
            <SelectTrigger className="w-64 glass-panel border-white/20">
              <SelectValue placeholder="Filter by job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs?.map(job => (
                <SelectItem key={job.id} value={String(job.id)} className="max-w-[320px]">
                  <span className="block max-w-[300px] truncate">{job.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Kanban Board */}
        <ScrollArea className="flex-1 w-full -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-6">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage.id}
                className="flex flex-col h-full"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                onDragLeave={() => {
                  if (dragOverStage === stage.id) setDragOverStage(null);
                }}
              >
                {/* Column Header */}
                <div className={`mb-3 flex items-center justify-between p-3 rounded-xl bg-slate-200 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 ${dragOverStage === stage.id ? 'ring-2 ring-primary/50' : ''
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${stage.dot} shadow-[0_0_10px_currentColor]`} />
                    <span className="font-bold text-sm tracking-tight">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="bg-black/5 dark:bg-white/10 text-foreground font-mono">
                    {appsByStage.get(stage.id)?.length || 0}
                  </Badge>
                </div>

                {/* Drop Zone / List */}
                <div className={`h-[320px] overflow-y-auto rounded-2xl p-1.5 space-y-2 border transition-colors duration-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] ${dragOverStage === stage.id
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                  }`}>
                  {(appsByStage.get(stage.id)?.length || 0) === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl m-1 opacity-50">
                      <p className="text-xs font-medium">Empty</p>
                    </div>
                  ) : (
                    (appsByStage.get(stage.id) || []).map((app, idx) => (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, app.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => openApplication(app.id)}
                        className={`
                          group relative p-3 rounded-xl border border-slate-200 dark:border-slate-700
                          bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5
                          transition-all duration-200 cursor-grab active:cursor-grabbing
                          border-l-[3px] border-l-primary
                          ${draggedApp === app.id ? 'opacity-40 rotate-2 scale-95 ring-2 ring-primary/50' : ''}
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 border border-slate-100 dark:border-slate-700 shadow-sm shrink-0">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[10px] font-bold">
                              {(app.candidate_profiles?.full_name || 'U').charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">
                                  {app.candidate_profiles?.full_name || 'Unknown'}
                                </p>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">
                                  {app.candidate_profiles?.current_title || 'No Title'}
                                </p>
                              </div>
                              <div className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-grab text-slate-400 hover:text-slate-600">
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </div>

                            {app.ai_match_score !== null && (
                              <div className="mt-3 mb-2">
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className="text-slate-500 font-medium">Match Score</span>
                                  <span className={`font-bold ${app.ai_match_score > 80 ? 'text-green-600' : app.ai_match_score > 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {app.ai_match_score}%
                                  </span>
                                </div>
                                <div className="h-1 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${app.ai_match_score > 80 ? 'bg-green-500' : app.ai_match_score > 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${app.ai_match_score}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                {app.jobs?.title}
                              </span>
                              <ArrowUpRight className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea >
      </div >

      <ApplicantDetailSheet
        applicationId={selectedApplicationId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedApplicationId(null);
        }}
      />
    </DashboardLayout >
  );
}
