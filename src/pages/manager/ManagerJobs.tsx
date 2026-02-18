import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Loader2, MapPin, Users, Calendar, Briefcase, Plus, UserPlus, Building2, MoreVertical, AlertCircle, Search, Pencil, ExternalLink, TrendingUp, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Job {
  id: string;
  title: string;
  location: string | null;
  status: string;
  applications_count: number;
  posted_at: string | null;
  is_remote: boolean;
  recruiter_id: string;
  client_id: string | null;
}

interface Assignment {
  job_id: string;
  user_id: string;
}

interface PipelineStats {
  applied: number;
  screening: number;
  interviewing: number;
  submitted: number;
  total: number;
}

export default function ManagerJobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { organizationId, user, isLoading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [assignedNames, setAssignedNames] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [pipelineStats, setPipelineStats] = useState<Record<string, PipelineStats>>({});
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [selectedRecruiterFilter, setSelectedRecruiterFilter] = useState<string>('all');
  const [allOrgRecruiters, setAllOrgRecruiters] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);

  const [assignDialogJobId, setAssignDialogJobId] = useState<string | null>(null);
  const [orgRecruiters, setOrgRecruiters] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [assignDialogLoading, setAssignDialogLoading] = useState(false);
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);

  const [selectedJobForDrawer, setSelectedJobForDrawer] = useState<Job | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) {
      fetchJobs();
      fetchAllRecruiters();
      fetchAllClients();
    } else {
      setIsLoading(false);
    }
  }, [organizationId, authLoading]);

  const fetchAllRecruiters = async () => {
    if (!organizationId) return;
    try {
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('role', 'recruiter');
      const userIds = (rolesData || []).map((r: { user_id: string }) => r.user_id);
      if (userIds.length === 0) {
        setAllOrgRecruiters([]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);
      setAllOrgRecruiters((profiles || []).map((p: { user_id: string; full_name: string | null; email: string }) => ({
        user_id: p.user_id,
        full_name: p.full_name || p.email || 'Recruiter',
        email: p.email || ''
      })));
    } catch (error) {
      console.error('Error fetching recruiters:', error);
    }
  };

  const fetchAllClients = async () => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      setAllClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const assignJobIdFromUrl = searchParams.get('assign');

  useEffect(() => {
    if (!assignJobIdFromUrl || jobs.length === 0) return;
    const job = jobs.find((j) => j.id === assignJobIdFromUrl);
    if (job) {
      setAssignDialogJobId(assignJobIdFromUrl);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('assign');
        return next;
      }, { replace: true });
    }
  }, [assignJobIdFromUrl, jobs, setSearchParams]);

  const fetchJobs = async () => {
    if (!organizationId) return;

    try {
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, location, status, applications_count, posted_at, is_remote, recruiter_id, client_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (jobsData) {
        setJobs(jobsData as Job[]);
        const jobIds = jobsData.map((j: { id: string }) => j.id);
        const ownerIds = [...new Set((jobsData as Job[]).map((j) => j.recruiter_id))];
        const clientIds = [...new Set((jobsData as Job[]).map((j) => j.client_id).filter(Boolean))];

        const [{ data: assignData }, { data: profiles }, { data: clients }, { data: applications }] = await Promise.all([
          jobIds.length > 0
            ? supabase
                .from('job_recruiter_assignments')
                .select('job_id, user_id')
                .in('job_id', jobIds)
            : Promise.resolve({ data: [] as Assignment[] }),
          supabase.from('profiles').select('user_id, full_name, email').in('user_id', ownerIds),
          clientIds.length > 0
            ? supabase.from('clients').select('id, name').in('id', clientIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          jobIds.length > 0
            ? supabase
                .from('applications')
                .select('job_id, status, applied_at')
                .in('job_id', jobIds)
            : Promise.resolve({ data: [] as { job_id: string; status: string; applied_at: string }[] }),
        ]);

        const assignList = (assignData || []) as Assignment[];
        setAssignments(assignList);
        const assignedIds = [...new Set(assignList.map((a) => a.user_id))];
        const allUserIds = [...new Set([...ownerIds, ...assignedIds])];
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', allUserIds);
        const byUserId = new Map((allProfiles || []).map((p: { user_id: string; full_name: string | null; email: string }) => [p.user_id, p.full_name || p.email || p.user_id]));
        setOwnerNames(Object.fromEntries([...byUserId]));
        setAssignedNames(Object.fromEntries([...byUserId]));

        // Set client names
        const byClientId = new Map((clients || []).map((c: { id: string; name: string }) => [c.id, c.name]));
        setClientNames(Object.fromEntries([...byClientId]));

        // Calculate pipeline stats per job
        const statsMap: Record<string, PipelineStats> = {};
        const activityMap: Record<string, string> = {};

        jobIds.forEach((jobId: string) => {
          const jobApps = (applications || []).filter((app: { job_id: string }) => app.job_id === jobId);

          // Calculate pipeline stats
          statsMap[jobId] = {
            applied: jobApps.filter((a: { status: string }) => a.status === 'applied' || a.status === 'engaged').length,
            screening: jobApps.filter((a: { status: string }) => a.status === 'screening' || a.status === 'reviewing').length,
            interviewing: jobApps.filter((a: { status: string }) => a.status === 'interviewing').length,
            submitted: jobApps.filter((a: { status: string }) => a.status === 'submission' || a.status === 'offered').length,
            total: jobApps.length,
          };

          // Find last activity date
          if (jobApps.length > 0) {
            const sortedApps = [...jobApps].sort((a: { applied_at: string }, b: { applied_at: string }) =>
              new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
            );
            activityMap[jobId] = sortedApps[0].applied_at;
          }
        });

        setPipelineStats(statsMap);
        setLastActivity(activityMap);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAssignedForJob = (jobId: string) => assignments.filter((a) => a.job_id === jobId).map((a) => a.user_id);
  const isJobOwnedByMe = (job: Job) => user?.id && job.recruiter_id === user.id;

  const openAssignDialog = async (jobId: string) => {
    setAssignDialogJobId(jobId);
    setSelectedRecruiterIds(new Set(getAssignedForJob(jobId)));
    setAssignDialogLoading(true);
    if (!organizationId) {
      setAssignDialogLoading(false);
      return;
    }
    try {
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('role', 'recruiter');
    const userIds = (rolesData || []).map((r: { user_id: string }) => r.user_id);
    if (userIds.length === 0) {
      setOrgRecruiters([]);
      return;
    }
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', userIds);
    setOrgRecruiters((profiles || []).map((p: { user_id: string; full_name: string | null; email: string }) => ({ user_id: p.user_id, full_name: p.full_name || p.email || 'Recruiter', email: p.email || '' })));
    } finally {
      setAssignDialogLoading(false);
    }
  };

  const saveAssignments = async () => {
    if (!assignDialogJobId || !organizationId || !user) return;
    setAssignSaving(true);
    try {
      const current = getAssignedForJob(assignDialogJobId);
      const toAdd = [...selectedRecruiterIds].filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !selectedRecruiterIds.has(id));

      // Add new assignments
      for (const uid of toAdd) {
        const { error } = await supabase.from('job_recruiter_assignments').insert({ job_id: assignDialogJobId, user_id: uid, assigned_by: user.id });
        if (error) throw error;
      }

      // Remove unassigned recruiters
      for (const uid of toRemove) {
        const { error } = await supabase.from('job_recruiter_assignments').delete().eq('job_id', assignDialogJobId).eq('user_id', uid);
        if (error) throw error;
      }

      // Send email notifications to newly assigned recruiters
      if (toAdd.length > 0) {
        try {
          await supabase.functions.invoke('notify-job-assignment', {
            body: {
              jobId: assignDialogJobId,
              recruiterIds: toAdd,
              assignedByUserId: user.id,
            },
          });
        } catch (emailError) {
          console.error('Failed to send email notifications:', emailError);
          // Don't fail the whole operation if email fails
        }
      }

      toast.success('Assignments updated');
      setAssignDialogJobId(null);
      fetchJobs();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to update assignments');
    } finally {
      setAssignSaving(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not posted';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-success/10 text-success';
      case 'draft': return 'bg-muted';
      case 'closed': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted';
    }
  };

  const getDaysSinceLastActivity = (jobId: string) => {
    const lastDate = lastActivity[jobId];
    if (!lastDate) return null;
    const last = new Date(lastDate);
    const now = new Date();
    return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  };

  const isJobAtRisk = (job: Job) => {
    if (job.status !== 'published') return false;
    const daysSinceActivity = getDaysSinceLastActivity(job.id);
    const stats = pipelineStats[job.id];

    // At risk if: no activity in 7+ days, or open 30+ days with no submissions
    if (daysSinceActivity !== null && daysSinceActivity >= 7) return true;

    const daysOpen = job.posted_at ? Math.floor((new Date().getTime() - new Date(job.posted_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    if (daysOpen >= 30 && stats && stats.submitted === 0) return true;

    return false;
  };

  const isJobUnassigned = (jobId: string) => {
    const assignedIds = getAssignedForJob(jobId);
    return assignedIds.length === 0;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground"><span className="text-gradient-manager">Jobs</span></h1>
              </div>
            <p className="text-lg text-muted-foreground font-sans">Your account manager role is active, but it isn’t linked to an organization yet.</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-sans text-muted-foreground">
                  Ask a platform admin to re-invite you or reassign you to a tenant.
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Filter jobs by all criteria
  const filteredJobs = jobs.filter((job) => {
    // Search filter
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;

    // Client filter
    const matchesClient =
      clientFilter === 'all' ||
      (clientFilter === 'no-client' && !job.client_id) ||
      job.client_id === clientFilter;

    // Recruiter filter
    let matchesRecruiter = true;
    if (selectedRecruiterFilter !== 'all') {
      if (selectedRecruiterFilter === 'unassigned') {
        matchesRecruiter = isJobUnassigned(job.id);
      } else {
        const assignedIds = getAssignedForJob(job.id);
        matchesRecruiter = assignedIds.includes(selectedRecruiterFilter);
      }
    }

    return matchesSearch && matchesStatus && matchesClient && matchesRecruiter;
  });

  const publishedJobs = jobs.filter(j => j.status === 'published');
  const draftJobs = jobs.filter(j => j.status === 'draft');
  const closedJobs = jobs.filter(j => j.status === 'closed');

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  <span className="text-gradient-manager">Jobs</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                All jobs in your organization
              </p>
            </div>
            <div className="flex justify-end shrink-0">
              <Button asChild variant="default" className="bg-manager hover:bg-manager/90">
                <Link to="/recruiter/jobs/new">
                  <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Create job
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-success">{publishedJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Published</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-foreground">{draftJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Drafts</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-destructive">{closedJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Closed</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search by title or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans w-full"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans">
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
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans">
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
          <Select value={selectedRecruiterFilter} onValueChange={setSelectedRecruiterFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans">
              <SelectValue placeholder="Recruiter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recruiters</SelectItem>
              <SelectItem value="unassigned" className="text-destructive font-medium">
                Unassigned
              </SelectItem>
              {allOrgRecruiters.map((recruiter) => (
                <SelectItem key={recruiter.user_id} value={recruiter.user_id}>
                  {recruiter.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">
            All Jobs {selectedRecruiterFilter !== 'all' && `(${filteredJobs.length} filtered)`}
          </h2>
          {filteredJobs.length === 0 ? (
            <p className="text-sm font-sans text-muted-foreground">
              {jobs.length === 0 ? 'No jobs created yet.' : 'No jobs match the selected filter.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => {
                const assignedIds = getAssignedForJob(job.id);
                const ownedByMe = isJobOwnedByMe(job);
                const stats = pipelineStats[job.id];
                const atRisk = isJobAtRisk(job);
                const daysSinceActivity = getDaysSinceLastActivity(job.id);
                return (
                  <div key={job.id} className="group p-4 rounded-xl border border-border hover:bg-manager/5 hover:border-manager/30 hover:shadow-md transition-all flex flex-wrap items-center justify-between gap-4">
                    <div
                      onClick={() => setSelectedJobForDrawer(job)}
                      className="space-y-2 min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="font-sans font-medium truncate hover:text-manager transition-colors">{job.title}</p>
                      <div className="flex items-center gap-4 text-sm font-sans text-muted-foreground flex-wrap">
                        {job.client_id && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" strokeWidth={1.5} />
                            {clientNames[job.client_id] || 'Unknown Client'}
                          </span>
                        )}
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" strokeWidth={1.5} />
                            {job.location}
                            {job.is_remote && ' (Remote)'}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" strokeWidth={1.5} />
                          {formatDate(job.posted_at)}
                        </span>
                      </div>
                      {stats && stats.total > 0 && (
                        <div className="flex items-center gap-2 text-xs font-sans font-medium text-foreground/70">
                          <span className="text-blue-600 dark:text-blue-400">{stats.applied}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-yellow-600 dark:text-yellow-400">{stats.screening}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-purple-600 dark:text-purple-400">{stats.interviewing}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600 dark:text-green-400 font-bold">{stats.submitted}</span>
                          <span className="text-muted-foreground ml-1">({stats.total} total)</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-sm font-sans text-muted-foreground">
                      <span title="Owner">Owner: {ownerNames[job.recruiter_id] ?? '—'}</span>
                      <span title="Assigned to">
                        Assigned: {assignedIds.length ? assignedIds.map((id) => assignedNames[id] ?? '—').join(', ') : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="flex items-center gap-1 text-sm font-sans text-muted-foreground">
                        <Users className="h-4 w-4" strokeWidth={1.5} />
                        {job.applications_count || 0} applicants
                      </div>
                      <Badge className={`font-sans ${getStatusColor(job.status || 'draft')}`}>
                        {job.status || 'draft'}
                      </Badge>
                      {atRisk && (
                        <Badge variant="destructive" className="font-sans">
                          ⚠️ At Risk
                          {daysSinceActivity !== null && daysSinceActivity >= 7 && (
                            <span className="ml-1">({daysSinceActivity}d)</span>
                          )}
                        </Badge>
                      )}
                      {isJobUnassigned(job.id) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="font-sans"
                          onClick={() => openAssignDialog(job.id)}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" strokeWidth={1.5} />
                          Assign Recruiter
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openAssignDialog(job.id)}>
                              <UserPlus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                              Edit Assignments
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={!!assignDialogJobId} onOpenChange={(open) => !open && setAssignDialogJobId(null)}>
          <DialogContent className="sm:max-w-md max-w-full">
            <DialogHeader>
              <DialogTitle>Assign recruiters to job</DialogTitle>
              <DialogDescription>Select recruiters who can work on this job. They will see it in their job list.</DialogDescription>
            </DialogHeader>
            {assignDialogLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-manager" strokeWidth={1.5} />
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
                {orgRecruiters.map((r) => (
                  <label key={r.user_id} className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/50">
                    <Checkbox
                      checked={selectedRecruiterIds.has(r.user_id)}
                      onCheckedChange={(checked) => {
                        setSelectedRecruiterIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(r.user_id);
                          else next.delete(r.user_id);
                          return next;
                        });
                      }}
                    />
                    <span className="font-sans font-medium">{r.full_name}</span>
                    <span className="text-sm text-muted-foreground truncate">{r.email}</span>
                  </label>
                ))}
                {orgRecruiters.length === 0 && (
                  <p className="text-sm text-muted-foreground">No recruiters in this organization.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogJobId(null)}>Cancel</Button>
              <Button onClick={saveAssignments} disabled={assignSaving || assignDialogLoading} className="bg-manager hover:bg-manager/90">
                {assignSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                      <Badge className={`font-sans ${getStatusColor(selectedJobForDrawer.status || 'draft')}`}>
                        {selectedJobForDrawer.status || 'draft'}
                      </Badge>
                      {selectedJobForDrawer.client_id && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-4 w-4" strokeWidth={1.5} />
                          {clientNames[selectedJobForDrawer.client_id] || 'Unknown Client'}
                        </span>
                      )}
                      {!selectedJobForDrawer.client_id && (
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
                            {formatDate(selectedJobForDrawer.posted_at)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium mb-1 text-sm">Applications</p>
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold">{selectedJobForDrawer.applications_count || 0}</span>
                        {pipelineStats[selectedJobForDrawer.id] && pipelineStats[selectedJobForDrawer.id].total > 0 && (
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <span className="text-blue-600 dark:text-blue-400">
                              {pipelineStats[selectedJobForDrawer.id].applied}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-yellow-600 dark:text-yellow-400">
                              {pipelineStats[selectedJobForDrawer.id].screening}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-purple-600 dark:text-purple-400">
                              {pipelineStats[selectedJobForDrawer.id].interviewing}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-600 dark:text-green-400 font-bold">
                              {pipelineStats[selectedJobForDrawer.id].submitted}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {(selectedJobForDrawer as any).description && (
                    <div>
                      <h3 className="font-semibold text-base mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {(selectedJobForDrawer as any).description}
                      </p>
                    </div>
                  )}

                  {/* Requirements */}
                  {(selectedJobForDrawer as any).requirements && (
                    <div>
                      <h3 className="font-semibold text-base mb-2">Requirements</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {(selectedJobForDrawer as any).requirements}
                      </p>
                    </div>
                  )}

                  {/* Responsibilities */}
                  {(selectedJobForDrawer as any).responsibilities && (
                    <div>
                      <h3 className="font-semibold text-base mb-2">Responsibilities</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {(selectedJobForDrawer as any).responsibilities}
                      </p>
                    </div>
                  )}

                  {/* Skills */}
                  {((selectedJobForDrawer as any).required_skills?.length > 0 || (selectedJobForDrawer as any).nice_to_have_skills?.length > 0) && (
                    <div>
                      <h3 className="font-semibold text-base mb-3">Skills</h3>
                      <div className="space-y-3">
                        {(selectedJobForDrawer as any).required_skills?.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Required</p>
                            <div className="flex flex-wrap gap-2">
                              {(selectedJobForDrawer as any).required_skills.map((skill: string) => (
                                <Badge key={skill} variant="secondary">{skill}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {(selectedJobForDrawer as any).nice_to_have_skills?.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Nice to Have</p>
                            <div className="flex flex-wrap gap-2">
                              {(selectedJobForDrawer as any).nice_to_have_skills.map((skill: string) => (
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

                  {/* Team */}
                  <div>
                    <h3 className="font-semibold text-base mb-3">Team</h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Owner</p>
                        <p>{ownerNames[selectedJobForDrawer.recruiter_id] || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Assigned Recruiters</p>
                        <p>
                          {(() => {
                            const assignedIds = getAssignedForJob(selectedJobForDrawer.id);
                            return assignedIds.length
                              ? assignedIds.map((id) => assignedNames[id] ?? '—').join(', ')
                              : 'None';
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
                    <Button
                      onClick={() => {
                        setSelectedJobForDrawer(null);
                        navigate(`/recruiter/jobs/${selectedJobForDrawer.id}/edit`);
                      }}
                      className="w-full bg-manager hover:bg-manager/90"
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
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}