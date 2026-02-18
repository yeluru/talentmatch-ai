import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  RotateCcw,
  Building2,
  AlertCircle,
  Calendar
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
  const { roles, currentRole, user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const isMobile = useIsMobile();
  const [selectedJobForDrawer, setSelectedJobForDrawer] = useState<any | null>(null);

  const organizationId = orgIdForRecruiterSuite(roles);
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId, ownerId] });
  }, [queryClient, organizationId, ownerId]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: handleRefresh,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recruiter-jobs', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from('jobs')
        .select(`
          *,
          organization:organizations(name),
          client:clients(id, name, status)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      // When AM/org_admin views as a specific recruiter (?owner=), filter to that owner's jobs.
      // When recruiter views their list, no server filter: we restrict to own + assigned in the UI below.
      if (ownerId && currentRole !== 'recruiter') q = q.eq('recruiter_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch all clients for filter dropdown
  const { data: allClients = [] } = useQuery({
    queryKey: ['clients', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status')
        .eq('organization_id', organizationId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // When viewing as recruiter (including AM who switched to recruiter), only show jobs they own or are assigned to.
  const { data: assignedJobIds = [] } = useQuery({
    queryKey: ['job-recruiter-assignments-me', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('job_recruiter_assignments')
        .select('job_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []).map((r: { job_id: string }) => r.job_id);
    },
    enabled: currentRole === 'recruiter' && !!user?.id,
  });
  const assignedSet = new Set(assignedJobIds);

  // Recruiter: jobs they created, assigned to them, or public jobs in the org (show owner for non-owned). AM/org_admin: all fetched jobs.
  const jobsForRole =
    currentRole === 'recruiter' && user?.id
      ? (jobs ?? []).filter(
          (j) =>
            j.recruiter_id === user.id ||
            assignedSet.has(j.id) ||
            (j as any).visibility === 'public'
        )
      : jobs ?? [];

  const ownerIds = [...new Set((jobsForRole || []).map((j) => j.recruiter_id).filter(Boolean))];
  const { data: ownerProfiles = [] } = useQuery({
    queryKey: ['recruiter-jobs-owner-names', ownerIds.sort().join(',')],
    queryFn: async () => {
      if (ownerIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', ownerIds);
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string | null }[];
    },
    enabled: ownerIds.length > 0,
  });
  const ownerNames: Record<string, string> = Object.fromEntries(
    (ownerProfiles || []).map((p) => [p.user_id, p.full_name || p.user_id] as const)
  );

  const getPublicJobUrl = (job: { id: string; organization?: { name: string } | null }) => {
    const orgSlug = job.organization?.name ? generateOrgSlug(job.organization.name) : 'org';
    return `${window.location.origin}/jobs/${orgSlug}/${job.id}`;
  };

  const copyJobUrl = (job: { id: string; organization?: { name: string } | null }) => {
    const url = getPublicJobUrl(job);
    navigator.clipboard.writeText(url);
    toast.success('Job URL copied to clipboard');
  };

  const openPublicJobPage = (job: { id: string; organization?: { name: string } | null }) => {
    window.open(getPublicJobUrl(job), '_blank', 'noopener,noreferrer');
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

  const filteredJobs = jobsForRole.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesClient =
      clientFilter === 'all' ||
      (clientFilter === 'no-client' && !(job as any).client_id) ||
      (job as any).client_id === clientFilter;
    return matchesSearch && matchesStatus && matchesClient;
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
          <Loader2 className="h-8 w-8 animate-spin text-recruiter" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 px-3 sm:px-4">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20 shrink-0">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-foreground truncate">
                  My <span className="text-gradient-recruiter">Jobs</span>
                </h1>
              </div>
              <p className="text-base sm:text-lg text-muted-foreground font-sans">
                Manage openness, visibility, and applicants for your roles.
              </p>
            </div>
            <Button asChild className="shrink-0 rounded-lg h-11 px-4 sm:px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold shadow-lg w-full sm:w-auto">
              <Link to="/recruiter/jobs/new">
                <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Post New Job
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="space-y-6 pt-6 pb-6 min-w-0">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search by title or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans w-full"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              <SelectItem value="no-client">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span>No Client Assigned</span>
                </div>
              </SelectItem>
              {allClients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {client.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!filteredJobs?.length ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState
              icon={Briefcase}
              title="No jobs found"
              description={jobsForRole.length ? 'Try adjusting your filters' : 'Create your first job posting to start attracting candidates'}
              action={
                !jobsForRole.length ? (
                  <Button asChild className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold">
                    <Link to="/recruiter/jobs/new">
                      <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      Post New Job
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="group rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
              >
                <div onClick={() => setSelectedJobForDrawer(job)} className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-6 block cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-display font-semibold text-lg text-foreground group-hover:text-recruiter transition-colors truncate block">
                        {job.title}
                      </span>
                      {getStatusBadge(job.status || 'draft')}
                      {(job as any).visibility === 'public' ? (
                        <Badge variant="outline" className="border-recruiter/30 text-recruiter bg-recruiter/10 font-sans">
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground font-sans">
                          Private
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-muted-foreground font-sans">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                        {(job as any).client?.name ? (
                          <span className="truncate">{(job as any).client.name}</span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            No Client Assigned
                          </span>
                        )}
                      </span>
                      {job.recruiter_id && job.recruiter_id !== user?.id && (
                        <span className="flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                          Owner: {ownerNames[job.recruiter_id] ?? '—'}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                          <span className="truncate">{job.location}{job.is_remote ? ' (Remote)' : ''}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                        {job.applications_count || 0} applicants
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                        {job.views_count || 0} views
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap" onClick={(e) => e.preventDefault()}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/recruiter/jobs/${job.id}/applicants`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = `/recruiter/jobs/${job.id}/applicants`; } }}
                      className="inline-flex items-center justify-center rounded-lg border border-border h-8 px-3 text-sm font-sans font-medium hover:bg-recruiter/10 hover:text-recruiter hover:border-recruiter/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
                    >
                      <Users className="h-3.5 w-3.5 mr-2" strokeWidth={1.5} />
                      View Applicants
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-recruiter/10 hover:text-recruiter">
                          <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl border border-border bg-card">
                      <div className="px-2 py-1.5 text-xs font-sans font-semibold text-muted-foreground">
                        Manage
                      </div>
                      <DropdownMenuItem asChild>
                        <Link to={`/recruiter/jobs/${job.id}/edit`}>
                          <Pencil className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Edit Job
                        </Link>
                      </DropdownMenuItem>

                      {(job as any).visibility !== 'public' ? (
                        <DropdownMenuItem
                          onClick={() => updateJobVisibility.mutate({ jobId: job.id, visibility: 'public' })}
                        >
                          <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Make Public (Marketplace)
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => updateJobVisibility.mutate({ jobId: job.id, visibility: 'private' })}
                        >
                          <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Make Private (Tenant Only)
                        </DropdownMenuItem>
                      )}

                      {job.status === 'published' && (job as any).visibility === 'public' && (
                        <>
                          <DropdownMenuItem onClick={() => copyJobUrl(job)}>
                            <Copy className="h-4 w-4 mr-2" strokeWidth={1.5} />
                            Copy Public URL
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPublicJobPage(job)}>
                            <ExternalLink className="h-4 w-4 mr-2" strokeWidth={1.5} />
                            Open Public Page
                          </DropdownMenuItem>
                        </>
                      )}

                      <div className="h-px bg-border my-1" />

                      {job.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                          className="text-green-600 focus:text-green-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Publish
                        </DropdownMenuItem>
                      )}
                      {job.status === 'published' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'closed' })}
                          className="text-orange-600 focus:text-orange-700"
                        >
                          <XCircle className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Close Job
                        </DropdownMenuItem>
                      )}
                      {job.status === 'closed' && (
                        <DropdownMenuItem
                          onClick={() => updateJobStatus.mutate({ jobId: job.id, status: 'published' })}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          Reopen
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <ScrollToTop />
          </div>
        </div>
      </div>

      <Sheet open={!!selectedJobForDrawer} onOpenChange={(open) => !open && setSelectedJobForDrawer(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {selectedJobForDrawer && (
            <>
              <SheetHeader className="space-y-4">
                <div>
                  <SheetTitle className="text-2xl font-display font-bold mb-2">
                    {selectedJobForDrawer.title}
                  </SheetTitle>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge className={selectedJobForDrawer.status === 'published' ? 'bg-success/10 text-success border-success/20' : selectedJobForDrawer.status === 'closed' ? 'bg-destructive/10 text-destructive' : 'bg-muted'}>
                      {selectedJobForDrawer.status === 'published' ? 'Published' : selectedJobForDrawer.status === 'draft' ? 'Draft' : selectedJobForDrawer.status === 'closed' ? 'Closed' : selectedJobForDrawer.status}
                    </Badge>
                    {(selectedJobForDrawer as any).visibility === 'public' ? (
                      <Badge variant="outline" className="border-recruiter/30 text-recruiter bg-recruiter/10 font-sans">
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground font-sans">
                        Private
                      </Badge>
                    )}
                    {(selectedJobForDrawer as any).client?.name ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Building2 className="h-4 w-4" strokeWidth={1.5} />
                        {(selectedJobForDrawer as any).client.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                        No Client Assigned
                      </span>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Basic Info */}
                <div className="space-y-4 pb-4 border-b">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedJobForDrawer.location && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Location</p>
                        <p className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                          {selectedJobForDrawer.location}
                          {selectedJobForDrawer.is_remote && ' (Remote)'}
                        </p>
                      </div>
                    )}
                    {selectedJobForDrawer.posted_at && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Posted Date</p>
                        <p className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                          {format(new Date(selectedJobForDrawer.posted_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Applications</p>
                      <span className="text-2xl font-bold">{selectedJobForDrawer.applications_count || 0}</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Views</p>
                      <span className="text-2xl font-bold">{selectedJobForDrawer.views_count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedJobForDrawer.description && (
                  <div>
                    <h3 className="font-semibold text-base mb-2">Description</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {selectedJobForDrawer.description}
                    </p>
                  </div>
                )}

                {/* Requirements */}
                {selectedJobForDrawer.requirements && (
                  <div>
                    <h3 className="font-semibold text-base mb-2">Requirements</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {selectedJobForDrawer.requirements}
                    </p>
                  </div>
                )}

                {/* Responsibilities */}
                {selectedJobForDrawer.responsibilities && (
                  <div>
                    <h3 className="font-semibold text-base mb-2">Responsibilities</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {selectedJobForDrawer.responsibilities}
                    </p>
                  </div>
                )}

                {/* Skills */}
                {(selectedJobForDrawer.required_skills?.length > 0 || selectedJobForDrawer.nice_to_have_skills?.length > 0) && (
                  <div>
                    <h3 className="font-semibold text-base mb-3">Skills</h3>
                    <div className="space-y-3">
                      {selectedJobForDrawer.required_skills?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Required</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedJobForDrawer.required_skills.map((skill: string) => (
                              <Badge key={skill} variant="secondary">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedJobForDrawer.nice_to_have_skills?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Nice to Have</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedJobForDrawer.nice_to_have_skills.map((skill: string) => (
                              <Badge key={skill} variant="outline">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Job Details */}
                <div>
                  <h3 className="font-semibold text-base mb-3">Job Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {(selectedJobForDrawer as any).job_type && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Job Type</p>
                        <p className="capitalize">{(selectedJobForDrawer as any).job_type.replace('_', '-')}</p>
                      </div>
                    )}
                    {(selectedJobForDrawer as any).experience_level && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Experience Level</p>
                        <p className="capitalize">{(selectedJobForDrawer as any).experience_level}</p>
                      </div>
                    )}
                    {(selectedJobForDrawer as any).work_mode && (selectedJobForDrawer as any).work_mode !== 'unknown' && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Work Mode</p>
                        <p className="capitalize">{(selectedJobForDrawer as any).work_mode}</p>
                      </div>
                    )}
                    {(selectedJobForDrawer as any).visibility && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Visibility</p>
                        <p className="capitalize">{(selectedJobForDrawer as any).visibility}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Owner info (if not the current user) */}
                {selectedJobForDrawer.recruiter_id && selectedJobForDrawer.recruiter_id !== user?.id && ownerNames[selectedJobForDrawer.recruiter_id] && (
                  <div>
                    <h3 className="font-semibold text-base mb-2">Owner</h3>
                    <p className="text-sm">{ownerNames[selectedJobForDrawer.recruiter_id]}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
                  <Button
                    onClick={() => {
                      setSelectedJobForDrawer(null);
                      navigate(`/recruiter/jobs/${selectedJobForDrawer.id}/edit`);
                    }}
                    className="w-full bg-recruiter hover:bg-recruiter/90"
                  >
                    <Pencil className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Edit Job
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedJobForDrawer(null);
                      navigate(`/recruiter/pipeline?job=${selectedJobForDrawer.id}`);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    View Pipeline
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedJobForDrawer(null);
                      navigate(`/recruiter/jobs/${selectedJobForDrawer.id}/applicants`);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Users className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    View Applicants
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
