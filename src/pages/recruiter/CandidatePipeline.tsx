import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, GripVertical, Users } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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
  { id: 'applied', label: 'Applied', color: 'bg-slate-500' },
  { id: 'reviewing', label: 'Reviewing', color: 'bg-blue-500' },
  { id: 'shortlisted', label: 'Shortlisted', color: 'bg-purple-500' },
  { id: 'interviewing', label: 'Interviewing', color: 'bg-yellow-500' },
  { id: 'offered', label: 'Offered', color: 'bg-green-500' },
  { id: 'hired', label: 'Hired', color: 'bg-emerald-600' },
  { id: 'rejected', label: 'Rejected', color: 'bg-red-500' },
];

export default function CandidatePipeline() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [draggedApp, setDraggedApp] = useState<string | null>(null);
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

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

  const { data: applications, isLoading } = useQuery({
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

  const updateStatus = useMutation({
    mutationFn: async ({ appId, status }: { appId: string; status: string }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', appId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'] });
      toast.success('Candidate moved');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleDragStart = (e: React.DragEvent, appId: string) => {
    setDraggedApp(appId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedApp) {
      updateStatus.mutate({ appId: draggedApp, status });
      setDraggedApp(null);
    }
  };

  const getApplicationsByStatus = (status: string) => {
    return applications?.filter(app => app.status === status) || [];
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Candidate Pipeline</h1>
            <p className="text-muted-foreground">Drag and drop candidates through hiring stages</p>
          </div>
          <Select value={selectedJob} onValueChange={setSelectedJob}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filter by job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs?.map(job => (
                <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage.id}
                className="w-72 shrink-0"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                        <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
                      </div>
                      <Badge variant="secondary">
                        {getApplicationsByStatus(stage.id).length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3 min-h-[400px]">
                      {getApplicationsByStatus(stage.id).length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                          Drop candidates here
                        </div>
                      ) : (
                        getApplicationsByStatus(stage.id).map(app => (
                          <div
                            key={app.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, app.id)}
                            className={`p-3 bg-card border rounded-lg cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                              draggedApp === app.id ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                                      {(app.candidate_profiles?.full_name || 'U').charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {app.candidate_profiles?.full_name || 'Unknown'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {app.candidate_profiles?.current_title || 'No title'}
                                    </p>
                                  </div>
                                </div>
                                {app.ai_match_score && (
                                  <Badge variant="outline" className="mt-2 text-xs">
                                    {app.ai_match_score}% match
                                  </Badge>
                                )}
                                <p className="text-xs text-muted-foreground mt-2 truncate">
                                  {app.jobs?.title}
                                </p>
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
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </DashboardLayout>
  );
}
