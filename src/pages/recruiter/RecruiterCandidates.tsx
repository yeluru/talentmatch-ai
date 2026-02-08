import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Search,
  Loader2,
  Users,
  Star,
  FileText,
  Sparkles,
  CheckCircle,
  XCircle,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { APPLICATION_STAGE_OPTIONS } from '@/lib/statusOptions';
import { openResumeInNewTab } from '@/lib/resumeLinks';

interface ParsedResumeContent {
  current_title?: string;
  years_of_experience?: number;
  full_name?: string;
  email?: string;
  skills?: string[];
}

interface ResumeWithParsed {
  id: string;
  file_name: string;
  file_url: string;
  parsed_content?: ParsedResumeContent | null;
}

interface ApplicationWithProfile {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string | null;
  applied_at: string;
  cover_letter: string | null;
  recruiter_notes: string | null;
  recruiter_rating: number | null;
  ai_match_score: number | null;
  ai_match_details: any;
  jobs: { id: string; title: string; organization_id: string } | null;
  candidate_profiles: { id: string; current_title: string | null; years_of_experience: number | null; user_id: string; email: string | null; phone: string | null; linkedin_url: string | null; full_name: string | null } | null;
  resumes: ResumeWithParsed | ResumeWithParsed[] | null;
  profile?: { user_id: string; full_name: string; email: string; phone: string | null; linkedin_url: string | null };
}

interface CandidateDetailContentProps {
  selectedApplication: ApplicationWithProfile | null;
  notes: string;
  setNotes: (notes: string) => void;
  rating: number;
  setRating: (rating: number) => void;
  getDisplayName: (app: ApplicationWithProfile) => string;
  updateApplication: any;
  isMobile?: boolean;
}

function CandidateDetailContent({
  selectedApplication,
  notes,
  setNotes,
  rating,
  setRating,
  getDisplayName,
  updateApplication,
  isMobile = false,
}: CandidateDetailContentProps) {
  if (!selectedApplication) return null;
  const [isOpeningResume, setIsOpeningResume] = useState(false);

  return (
    <div
      className={`space-y-6 ${isMobile ? 'px-4 pb-8 overflow-y-auto overscroll-contain scrollbar-hide' : 'py-4'}`}
      style={isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}
    >
      {/* Status */}
      <div className="space-y-2">
        <Label className="text-sm font-sans">Status</Label>
        <Select
          value={selectedApplication?.status || 'applied'}
          onValueChange={(value) => updateApplication.mutate({
            appId: selectedApplication.id,
            status: value
          })}
        >
          <SelectTrigger className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPLICATION_STAGE_OPTIONS.filter((o) => o.value !== 'reviewed').map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* AI Match Score */}
      {selectedApplication?.ai_match_score && (
        <div className="flex items-center gap-4 p-4 rounded-lg border border-recruiter/20 bg-recruiter/5">
          <Sparkles className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
          <div>
            <div className="font-medium">AI Match Score</div>
            <div className="text-sm">
              {selectedApplication.ai_match_score}% match for this position
            </div>
          </div>
        </div>
      )}

      {/* Cover Letter */}
      {selectedApplication?.cover_letter && (
        <div className="space-y-2">
          <Label className="text-sm font-sans">Cover Letter</Label>
          <div className="p-4 rounded-lg border border-border bg-muted/50 text-sm font-sans">
            {selectedApplication.cover_letter}
          </div>
        </div>
      )}

      {/* Resume */}
      {selectedApplication?.resumes && (Array.isArray(selectedApplication.resumes) ? selectedApplication.resumes.length > 0 : true) && (
        <div className="space-y-2">
          <Label className="text-sm font-sans">Resume</Label>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
            disabled={isOpeningResume}
            onClick={async () => {
              try {
                const fileUrl = Array.isArray(selectedApplication.resumes)
                  ? selectedApplication.resumes[0]?.file_url
                  : selectedApplication.resumes?.file_url;
                setIsOpeningResume(true);
                await openResumeInNewTab(fileUrl, { expiresInSeconds: 600 });
              } catch (e: any) {
                toast.error(e?.message || 'Could not open resume');
              } finally {
                setIsOpeningResume(false);
              }
            }}
          >
            {isOpeningResume ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : <FileText className="h-4 w-4 mr-2" strokeWidth={1.5} />}
            View Resume
          </Button>
        </div>
      )}

      {/* Rating */}
      <div className="space-y-2">
        <Label className="text-sm font-sans">Your Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="p-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
            >
              <Star
                className={`h-6 w-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : ''}`}
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-sm font-sans">Notes</Label>
        <Textarea
          placeholder="Add your notes about this candidate..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans resize-none"
        />
      </div>

      <Button
        onClick={() => updateApplication.mutate({
          appId: selectedApplication.id,
          notes,
          rating
        })}
        disabled={updateApplication.isPending}
        className="w-full h-11 rounded-lg border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
      >
        {updateApplication.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : null}
        Save Changes
      </Button>
    </div>
  );
}

export default function RecruiterCandidates() {
  const { roles, currentRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>(searchParams.get('job') || 'all');
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);

  const organizationId = orgIdForRecruiterSuite(roles);
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['recruiter-applications', organizationId, selectedJobFilter] });
  }, [queryClient, organizationId, selectedJobFilter]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: handleRefresh,
  });

  // Fetch jobs for filter. Candidate = belongs to job owner. Recruiter: only jobs I own; AM with ?owner=: that owner's jobs.
  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs-filter', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase.from('jobs').select('id, title').eq('organization_id', organizationId);
      if (ownerId) q = q.eq('recruiter_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch applications. Candidate belongs to job owner: recruiter sees only applicants to jobs they own; AM with ?owner=: that owner's.
  const { data: applications, isLoading } = useQuery<ApplicationWithProfile[]>({
    queryKey: ['recruiter-applications', organizationId, selectedJobFilter, ownerId],
    queryFn: async (): Promise<ApplicationWithProfile[]> => {
      if (!organizationId) return [];

      let query = supabase
        .from('applications')
        .select(`
          *,
          jobs!inner(id, title, organization_id, recruiter_id),
          candidate_profiles!inner(id, current_title, years_of_experience, user_id, email, phone, linkedin_url, full_name),
          resumes(id, file_name, file_url, parsed_content)
        `)
        .eq('jobs.organization_id', organizationId)
        .order('applied_at', { ascending: false });

      if (ownerId) query = query.eq('jobs.recruiter_id', ownerId);
      if (selectedJobFilter !== 'all') {
        query = query.eq('job_id', selectedJobFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profile names separately
      const userIds = data?.map(a => a.candidate_profiles?.user_id).filter(Boolean) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone, linkedin_url')
          .in('user_id', userIds);

        return (data?.map(app => ({
          ...app,
          profile: profiles?.find(p => p.user_id === app.candidate_profiles?.user_id)
        })) || []) as unknown as ApplicationWithProfile[];
      }

      return (data || []) as unknown as ApplicationWithProfile[];
    },
    enabled: !!organizationId,
  });

  const updateApplication = useMutation({
    mutationFn: async ({ appId, status, notes, rating }: {
      appId: string;
      status?: string;
      notes?: string;
      rating?: number;
    }) => {
      const updateData: any = {};
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.recruiter_notes = notes;
      if (rating !== undefined) updateData.recruiter_rating = rating;

      const { error } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', appId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      toast.success('Application updated');
      setSelectedApplication(null);
    },
    onError: () => {
      toast.error('Failed to update application');
    },
  });

  const getResumeData = (app: ApplicationWithProfile): ParsedResumeContent | null => {
    if (!app.resumes) return null;
    const resume = Array.isArray(app.resumes) ? app.resumes[0] : app.resumes;
    return (resume?.parsed_content as ParsedResumeContent) || null;
  };

  const getDisplayName = (app: ApplicationWithProfile): string => {
    const cpName = (app.candidate_profiles?.full_name || '').trim();
    const isPlaceholderCpName = ['candidate', 'recruiter', 'account_manager', 'unknown'].includes(cpName.toLowerCase());
    if (cpName && !isPlaceholderCpName) return cpName;

    const rawName = (app.profile?.full_name || '').trim();
    const isPlaceholderName = ['candidate', 'recruiter', 'account_manager', 'unknown'].includes(rawName.toLowerCase());
    if (rawName && !isPlaceholderName) return rawName;

    const resumeData = getResumeData(app);
    const resumeName = (resumeData?.full_name || '').trim();
    if (resumeName) return resumeName;

    const email = getDisplayEmail(app);
    if (email) {
      const local = (email || '').trim().split('@')[0];
      if (local) return local;
      return email;
    }

    return 'Applicant';
  };

  const getDisplayEmail = (app: ApplicationWithProfile): string => {
    return app.candidate_profiles?.email || app.profile?.email || '';
  };

  const getDisplayPhone = (app: ApplicationWithProfile): string => {
    return app.candidate_profiles?.phone || app.profile?.phone || '';
  };

  const getDisplayLinkedIn = (app: ApplicationWithProfile): string => {
    return app.candidate_profiles?.linkedin_url || app.profile?.linkedin_url || '';
  };

  const getDisplayTitle = (app: ApplicationWithProfile): string => {
    if (app.candidate_profiles?.current_title) return app.candidate_profiles.current_title;
    const resumeData = getResumeData(app);
    if (resumeData?.current_title) return resumeData.current_title;
    return 'No title';
  };

  const getDisplayExperience = (app: ApplicationWithProfile): number => {
    if (app.candidate_profiles?.years_of_experience) return app.candidate_profiles.years_of_experience;
    const resumeData = getResumeData(app);
    if (resumeData?.years_of_experience) return resumeData.years_of_experience;
    return 0;
  };

  const filteredApplications = applications?.filter((app) => {
    const name = getDisplayName(app);
    const title = getDisplayTitle(app);
    const matchesSearch =
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenDetails = (app: any) => {
    setSelectedApplication(app);
    setNotes(app.recruiter_notes || '');
    setRating(app.recruiter_rating || 0);
  };

  const handleCloseDetails = () => {
    setSelectedApplication(null);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-recruiter" strokeWidth={1.5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const detailHeader = selectedApplication ? (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10 border border-recruiter/20">
        <AvatarFallback className="bg-recruiter/10 text-recruiter font-sans font-bold">
          {getDisplayName(selectedApplication).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div>
        <div className="font-display font-semibold text-foreground">{getDisplayName(selectedApplication)}</div>
        <div className="text-sm text-muted-foreground font-sans">
          {selectedApplication?.candidate_profiles?.current_title}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <DashboardLayout>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  My <span className="text-gradient-recruiter">Candidates</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Review and manage applicants across your jobs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans"
            />
          </div>
          <Select value={selectedJobFilter} onValueChange={setSelectedJobFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans">
              <SelectValue placeholder="All Jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs?.map((job) => (
                <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {APPLICATION_STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-0">
          {!filteredApplications?.length ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="No candidates found"
                description={applications?.length ? "Try adjusting your filters" : "Applications will appear here when candidates apply"}
              />
            </div>
          ) : isMobile ? (
            <div className="divide-y divide-border">
              {filteredApplications.map((app) => {
                const rowContent = (
                  <div
                    className="flex items-center gap-2 py-2.5 px-4 cursor-pointer active:bg-recruiter/5"
                    onClick={() => handleOpenDetails(app)}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 border border-recruiter/20">
                      <AvatarFallback className="bg-recruiter/10 text-recruiter text-xs font-sans">
                        {getDisplayName(app).charAt(0).toUpperCase() || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-semibold truncate text-foreground">{getDisplayName(app)}</div>
                      <div className="text-xs text-muted-foreground font-sans truncate">{app.jobs?.title} · {getDisplayTitle(app)}</div>
                    </div>
                    <StatusBadge status={app.status || 'applied'} />
                    {app.ai_match_score ? <ScoreBadge score={app.ai_match_score} size="sm" showLabel={false} /> : null}
                    {app.recruiter_rating ? <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0" strokeWidth={1.5} /> : null}
                  </div>
                );
                return (
                  <SwipeableRow
                    key={app.id}
                    leftActions={[
                      { icon: <CheckCircle className="h-5 w-5" strokeWidth={1.5} />, label: 'Shortlist', className: 'bg-green-600 text-white', onAction: () => updateApplication.mutate({ appId: app.id, status: 'client_shortlist' }) },
                    ]}
                    rightActions={[
                      { icon: <XCircle className="h-5 w-5" strokeWidth={1.5} />, label: 'Reject', className: 'bg-destructive text-destructive-foreground', onAction: () => updateApplication.mutate({ appId: app.id, status: 'rejected' }) },
                    ]}
                    className="-mx-6"
                  >
                    {rowContent}
                  </SwipeableRow>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 px-1">
              <div className="hidden md:flex items-center px-6 pb-2 text-xs font-medium text-muted-foreground font-sans uppercase tracking-widest">
                <div className="flex-1">Candidate</div>
                <div className="w-32">Status</div>
                <div className="w-20 text-center">Match</div>
                <div className="w-24 text-right">Applied</div>
                <div className="w-20 text-right">Rating</div>
              </div>
              {filteredApplications.map((app) => (
                <div
                  key={app.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDetails(app)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetails(app); } }}
                  className="group rounded-xl border border-border bg-card p-4 flex items-center gap-4 cursor-pointer transition-all duration-300 hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Avatar className="h-10 w-10 flex-shrink-0 border border-recruiter/20">
                      <AvatarFallback className="bg-recruiter/10 text-recruiter text-xs font-sans font-bold">
                        {getDisplayName(app).charAt(0).toUpperCase() || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-foreground truncate group-hover:text-recruiter transition-colors">{getDisplayName(app)}</div>
                      <div className="text-xs text-muted-foreground font-sans truncate flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3" strokeWidth={1.5} />
                        {app.jobs?.title ?? '—'}
                        <span className="opacity-50">|</span>
                        {getDisplayTitle(app)}
                      </div>
                    </div>
                  </div>

                  <div className="w-32 flex-shrink-0">
                    <StatusBadge status={app.status || 'applied'} />
                  </div>

                  <div className="w-20 flex-shrink-0 flex justify-center">
                    {app.ai_match_score ? <ScoreBadge score={app.ai_match_score} size="sm" showLabel={false} /> : <span className="text-muted-foreground font-sans">—</span>}
                  </div>

                  <div className="w-24 flex-shrink-0 text-right text-sm text-muted-foreground font-sans font-mono">
                    {format(new Date(app.applied_at), 'MMM d')}
                  </div>

                  <div className="w-20 flex-shrink-0 flex justify-end">
                    {app.recruiter_rating ? (
                      <div className="flex items-center gap-1 bg-yellow-400/10 px-2 py-1 rounded-lg border border-yellow-400/20">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
                        <span className="text-xs font-bold text-yellow-600 font-sans">{app.recruiter_rating}</span>
                      </div>
                    ) : (
                      <Star className="h-4 w-4 text-muted-foreground/20" strokeWidth={1.5} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

          <ScrollToTop />
          </div>
        </div>
      </div>

      {/* Candidate Details - Drawer on mobile, Dialog on desktop */}
      {isMobile ? (
        <Drawer open={!!selectedApplication} onOpenChange={(open) => !open && handleCloseDetails()}>
          <DrawerContent className="max-h-[92vh] w-full overflow-hidden flex flex-col">
            <DrawerHeader className="text-left flex-shrink-0 pb-2">
              {detailHeader}
              <DrawerDescription className="text-xs mt-1">
                Applied for {selectedApplication?.jobs?.title}
              </DrawerDescription>
            </DrawerHeader>
            <CandidateDetailContent
              selectedApplication={selectedApplication}
              notes={notes}
              setNotes={setNotes}
              rating={rating}
              setRating={setRating}
              getDisplayName={getDisplayName}
              updateApplication={updateApplication}
              isMobile
            />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!selectedApplication} onOpenChange={(open) => !open && handleCloseDetails()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {detailHeader}
              </DialogTitle>
              <DialogDescription>
                Applied for {selectedApplication?.jobs?.title}
              </DialogDescription>
            </DialogHeader>
            <CandidateDetailContent
              selectedApplication={selectedApplication}
              notes={notes}
              setNotes={setNotes}
              rating={rating}
              setRating={setRating}
              getDisplayName={getDisplayName}
              updateApplication={updateApplication}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
