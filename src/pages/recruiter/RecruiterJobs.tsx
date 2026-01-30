import { useState, useCallback } from 'react';
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
import { orgIdForRecruiterSuite } from '@/lib/org';
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
  Briefcase,
  Copy,
  ExternalLink,
  Pencil,
  XCircle,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { generateOrgSlug } from '@/lib/orgSlug';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListHeader } from '@/components/ui/mobile-list-header';

export default function RecruiterJobs() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const isMobile = useIsMobile();

  const organizationId = orgIdForRecruiterSuite(roles);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId] });
  }, [queryClient, organizationId]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: handleRefresh,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          organization:organizations(name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const getPublicJobUrl = (job: { id: string; organization?: { name: string } | null }) => {
    const orgSlug = job.organization?.name ? generateOrgSlug(job.organization.name) : 'org';
    return `${window.location.origin}/jobs/${orgSlug}/${job.id}`;
  };

  const copyJobUrl = (job: { id: string; organization?: { name: string } | null }) => {
    const url = getPublicJobUrl(job);
    navigator.clipboard.writeText(url);
    toast.success('Job URL copied to clipboard');
  };

  const updateJobStatus = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
      const { error } = await supabase
        .from('jobs')
        .update({ status, posted_at: status === 'published' ? new Date().toISOString() : null })
        .eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId] });
      toast.success('Job status updated');
    },
    onError: () => {
      toast.error('Failed to update job status');
    },
  });

  const updateJobVisibility = useMutation({
    mutationFn: async ({ jobId, visibility }: { jobId: string; visibility: 'private' | 'public' }) => {
      const { error } = await supabase
        .from('jobs')
        .update({ visibility } as any)
        .eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId] });
      toast.success('Job visibility updated');
    },
    onError: () => {
      toast.error('Failed to update job visibility');
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
        return <Badge variant="outline" className="">Closed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <span className="text-gradient-premium">Job Postings</span>
            </h1>
            <p className="mt-2 text-muted-foreground text-lg">
              Manage openness, visibility, and applicants for your roles.
            </p>
          </div>
          <Button asChild className="shrink-0 shadow-lg shadow-primary/20">
            <Link to="/recruiter/jobs/new">
              <Plus className="h-4 w-4 mr-2" />
              Post New Job
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 glass-panel p-3 rounded-xl border border-white/10">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-transparent border-white/10 focus:bg-background/50 transition-colors"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-transparent border-white/10">
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

        {!filteredJobs?.length ? (
          <Card className="glass-card border-none overflow-hidden">
            <CardContent className="p-0">
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
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="glass-panel p-6 hover-card-premium group rounded-xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Link to={`/recruiter/jobs/${job.id}/edit`} className="font-display font-semibold text-lg text-foreground hover:text-primary transition-colors truncate">
                        {job.title}
                      </Link>
                      {getStatusBadge(job.status || 'draft')}
                      {(job as any).visibility === 'public' ? (
                        <Badge variant="outline" className="border-violet-500/30 text-violet-600 bg-violet-500/5">
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Private
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                      {job.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 opacity-70" />
                          {job.location}
                          {job.is_remote && ' (Remote)'}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 opacity-70" />
                        {job.applications_count || 0} applicants
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 opacity-70" />
                        {job.views_count || 0} views
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link to={`/recruiter/jobs/${job.id}/applicants`}>
                          <Users className="h-3.5 w-3.5 mr-2" />
                          View Applicants
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 glass-panel border-white/20">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Manage
                      </div>
                      <DropdownMenuItem asChild>
                        <Link to={`/recruiter/jobs/${job.id}/edit`}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Job
                        </Link>
                      </DropdownMenuItem>

                      {(job as any).visibility !== 'public' ? (
                        <DropdownMenuItem
                          onClick={() => updateJobVisibility.mutate({ jobId: job.id, visibility: 'public' })}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Make Public (Marketplace)
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => updateJobVisibility.mutate({ jobId: job.id, visibility: 'private' })}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Make Private (Tenant Only)
                        </DropdownMenuItem>
                      )}

                      {job.status === 'published' && (job as any).visibility === 'public' && (
                        <>
                          <DropdownMenuItem onClick={() => copyJobUrl(job)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Public URL
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={getPublicJobUrl(job)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open Public Page
                            </a>
                          </DropdownMenuItem>
                        </>
                      )}

                      <div className="h-px bg-border my-1" />

                      {job.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                          className="text-green-600 focus:text-green-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Publish
                        </DropdownMenuItem>
                      )}
                      {job.status === 'published' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'closed' })}
                          className="text-orange-600 focus:text-orange-700"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Close Job
                        </DropdownMenuItem>
                      )}
                      {job.status === 'closed' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reopen
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
        <ScrollToTop />
      </div>
    </DashboardLayout>
  );
}
