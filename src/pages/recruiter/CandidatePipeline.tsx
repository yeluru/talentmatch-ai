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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">Candidate Pipeline</h1>
            <p className="">
              Showing: <span className="text-foreground">{selectedJobTitle}</span> ·{' '}
              <span className="text-foreground">{totalVisible}</span> candidate{totalVisible === 1 ? '' : 's'}
              {isFetching ? <span className="ml-2">(Updating…)</span> : null}
            </p>
          </div>
          <Select value={selectedJob} onValueChange={(v) => setSelectedJob(String(v))}>
            <SelectTrigger className="w-64">
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

        {/* Wrap stages into a responsive grid (no horizontal scrolling needed) */}
        <ScrollArea className="w-full">
          <div className="grid gap-3 pb-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage.id}
                className="min-w-0"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                onDragLeave={() => {
                  if (dragOverStage === stage.id) setDragOverStage(null);
                }}
              >
                <Card
                  className={`h-full overflow-hidden rounded-2xl border bg-card/70 shadow-sm ${
                    dragOverStage === stage.id ? 'ring-2 ring-primary/20 border-primary/30' : ''
                  }`}
                >
                  <CardHeader className={`py-3 px-4 bg-background/70 backdrop-blur-sm border-b ${stage.border}`}>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-2.5 w-2.5 rounded-full ${stage.dot} shrink-0`} />
                          <CardTitle className="text-sm font-semibold truncate">{stage.label}</CardTitle>
                        </div>
                        {draggedApp ? (
                          <div className="text-xsmt-1">Drop here to move</div>
                        ) : null}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {(appsByStage.get(stage.id)?.length || 0)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 bg-muted/10">
                    <div className="space-y-2 min-h-[160px]">
                      {(appsByStage.get(stage.id)?.length || 0) === 0 ? (
                        <div
                          className={`rounded-xl border border-dashed p-6 ${
                            draggedApp || dragOverStage === stage.id
                              ? 'bg-primary/5 border-primary/30 text-foreground'
                              : 'bg-background/50 border-muted-foreground/15'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2 text-center">
                            <Users className="h-4 w-4 opacity-70" />
                            <div className="text-sm font-medium">
                              {draggedApp || dragOverStage === stage.id ? 'Drop candidates here' : 'No candidates'}
                            </div>
                            <div className="text-xs">
                              {draggedApp ? 'Release to move into this stage.' : 'Drag a card here to move it.'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        (appsByStage.get(stage.id) || []).map((app, idx) => (
                          <div
                            key={app.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, app.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => openApplication(app.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openApplication(app.id);
                            }}
                            className={`group p-3 rounded-xl border cursor-pointer transition-colors ${
                              draggedApp === app.id
                                ? 'opacity-50'
                                : idx % 2 === 1
                                  ? 'bg-secondary/40 hover:bg-secondary/60 hover:border-primary/20'
                                  : 'bg-background hover:bg-muted/50 hover:border-primary/20'
                            }`}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="mt-0.5 shrink-0group-hover:text-foreground/80">
                                <GripVertical className="h-4 w-4" />
                              </div>

                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarFallback className="text-xs bg-accent/25 text-accent-foreground">
                                  {(app.candidate_profiles?.full_name || 'U').charAt(0)}
                                </AvatarFallback>
                              </Avatar>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm truncate">
                                      {app.candidate_profiles?.full_name || 'Unknown'}
                                    </p>
                                    <p className="text-xstruncate">
                                      {app.candidate_profiles?.current_title || 'No title'}
                                    </p>
                                  </div>
                                  <ArrowUpRight className="h-4 w-4opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>

                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  {app.ai_match_score ? (
                                    <Badge variant="outline" className="text-xs">
                                      {app.ai_match_score}% match
                                    </Badge>
                                  ) : null}
                                  {app.jobs?.title ? (
                                    <span className="text-xstruncate max-w-[220px]">
                                      {app.jobs.title}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ApplicantDetailSheet
        applicationId={selectedApplicationId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedApplicationId(null);
        }}
      />
    </DashboardLayout>
  );
}
