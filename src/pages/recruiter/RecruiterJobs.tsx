import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  MapPin, 
  Users, 
  Eye,
  Loader2,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';

export default function RecruiterJobs() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const updateJobStatus = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
      const { error } = await supabase
        .from('jobs')
        .update({ status, posted_at: status === 'published' ? new Date().toISOString() : null })
        .eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] });
      toast.success('Job status updated');
    },
    onError: () => {
      toast.error('Failed to update job status');
    },
  });

  const filteredJobs = jobs?.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-success/10 text-success border-success/20">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">My Jobs</h1>
            <p className="text-muted-foreground mt-1">
              Manage your job postings
            </p>
          </div>
          <Button asChild>
            <Link to="/recruiter/jobs/new">
              <Plus className="h-4 w-4 mr-2" />
              Post New Job
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!filteredJobs?.length ? (
              <EmptyState
                icon={Briefcase}
                title="No jobs found"
                description={jobs?.length ? "Try adjusting your filters" : "Create your first job posting to start attracting candidates"}
                action={
                  !jobs?.length ? (
                    <Button asChild>
                      <Link to="/recruiter/jobs/new">
                        <Plus className="h-4 w-4 mr-2" />
                        Post New Job
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y">
                {filteredJobs.map((job) => (
                  <div key={job.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{job.title}</h3>
                          {getStatusBadge(job.status || 'draft')}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          {job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {job.location}
                              {job.is_remote && ' (Remote)'}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {job.applications_count || 0} applicants
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {job.views_count || 0} views
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {format(new Date(job.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {job.status === 'draft' && (
                            <DropdownMenuItem
                              onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                            >
                              Publish
                            </DropdownMenuItem>
                          )}
                          {job.status === 'published' && (
                            <DropdownMenuItem
                              onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'closed' })}
                            >
                              Close Job
                            </DropdownMenuItem>
                          )}
                          {job.status === 'closed' && (
                            <DropdownMenuItem
                              onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                            >
                              Reopen
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link to={`/recruiter/candidates?job=${job.id}`}>
                              View Applicants
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
