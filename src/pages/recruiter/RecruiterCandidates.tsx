import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { orgIdForRecruiterSuite } from '@/lib/org';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MobileListHeader } from '@/components/ui/mobile-list-header';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { APPLICATION_STAGE_OPTIONS } from '@/lib/statusOptions';
import { openResumeInNewTab } from '@/lib/resumeLinks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
        <Label>Status</Label>
        <Select 
          value={selectedApplication?.status || 'applied'} 
          onValueChange={(value) => updateApplication.mutate({ 
            appId: selectedApplication.id, 
            status: value 
          })}
        >
          <SelectTrigger>
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
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <Sparkles className="h-5 w-5 text-accent" />
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
          <Label>Cover Letter</Label>
          <div className="p-4 bg-muted rounded-lg text-sm">
            {selectedApplication.cover_letter}
          </div>
        </div>
      )}

      {/* Resume */}
      {selectedApplication?.resumes && (Array.isArray(selectedApplication.resumes) ? selectedApplication.resumes.length > 0 : true) && (
        <div className="space-y-2">
          <Label>Resume</Label>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
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
            {isOpeningResume ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            View Resume
          </Button>
        </div>
      )}

      {/* Rating */}
      <div className="space-y-2">
        <Label>Your Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="p-1"
            >
              <Star 
                className={`h-6 w-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : ''}`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Add your notes about this candidate..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </div>

      <Button 
        onClick={() => updateApplication.mutate({ 
          appId: selectedApplication.id, 
          notes, 
          rating 
        })}
        disabled={updateApplication.isPending}
        className="w-full"
      >
        {updateApplication.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save Changes
      </Button>
    </div>
  );
}

export default function RecruiterCandidates() {
  const { roles } = useAuth();
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

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['recruiter-applications', organizationId, selectedJobFilter] });
  }, [queryClient, organizationId, selectedJobFilter]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: handleRefresh,
  });

  // Fetch jobs for filter
  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs-filter', organizationId],
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

  // Fetch applications with candidate info
  const { data: applications, isLoading } = useQuery<ApplicationWithProfile[]>({
    queryKey: ['recruiter-applications', organizationId, selectedJobFilter],
    queryFn: async (): Promise<ApplicationWithProfile[]> => {
      if (!organizationId) return [];
      
      let query = supabase
        .from('applications')
        .select(`
          *,
          jobs!inner(id, title, organization_id),
          candidate_profiles!inner(id, current_title, years_of_experience, user_id, email, phone, linkedin_url, full_name),
          resumes(id, file_name, file_url, parsed_content)
        `)
        .eq('jobs.organization_id', organizationId)
        .order('applied_at', { ascending: false });
      
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
    if (resumeData?.full_name) return resumeData.full_name;

    const email = getDisplayEmail(app);
    if (email) return email;

    return 'Unknown';
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const detailHeader = selectedApplication ? (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-accent text-accent-foreground">
          {getDisplayName(selectedApplication).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div>
        <div className="font-semibold">{getDisplayName(selectedApplication)}</div>
        <div className="text-sm">
          {selectedApplication?.candidate_profiles?.current_title}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <DashboardLayout>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <MobileListHeader
        title="Candidates"
        subtitle="Review and manage job applicants"
        filterCount={
          (statusFilter !== 'all' ? 1 : 0) + 
          (selectedJobFilter !== 'all' ? 1 : 0)
        }
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedJobFilter} onValueChange={setSelectedJobFilter}>
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="reviewing">Reviewing</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="interviewing">Interviewing</SelectItem>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </MobileListHeader>

      <Card className="mt-4">
        <CardContent className="p-0">
            {!filteredApplications?.length ? (
              <div className="p-6">
                <EmptyState
                  icon={Users}
                  title="No candidates found"
                  description={applications?.length ? "Try adjusting your filters" : "Applications will appear here when candidates apply"}
                />
              </div>
            ) : isMobile ? (
              <div className="divide-y">
                {filteredApplications.map((app) => {
                  const rowContent = (
                    <div
                      className="flex items-center gap-2 py-2.5 px-4 cursor-pointer active:bg-muted"
                      onClick={() => handleOpenDetails(app)}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                          {getDisplayName(app).charAt(0).toUpperCase() || 'C'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{getDisplayName(app)}</div>
                        <div className="text-xstruncate">{app.jobs?.title} · {getDisplayTitle(app)}</div>
                      </div>
                      <StatusBadge status={app.status || 'applied'} />
                      {app.ai_match_score ? <ScoreBadge score={app.ai_match_score} size="sm" showLabel={false} /> : null}
                      {app.recruiter_rating ? <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0" /> : null}
                    </div>
                  );
                  return (
                    <SwipeableRow
                      key={app.id}
                      leftActions={[
                        { icon: <CheckCircle className="h-5 w-5" />, label: 'Shortlist', className: 'bg-green-600 text-white', onAction: () => updateApplication.mutate({ appId: app.id, status: 'shortlisted' }) },
                      ]}
                      rightActions={[
                        { icon: <XCircle className="h-5 w-5" />, label: 'Reject', className: 'bg-destructive text-destructive-foreground', onAction: () => updateApplication.mutate({ appId: app.id, status: 'rejected' }) },
                      ]}
                      className="-mx-6"
                    >
                      {rowContent}
                    </SwipeableRow>
                  );
                })}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="max-w-[140px]">Job</TableHead>
                    <TableHead className="max-w-[160px]">Title</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-14 text-right">Match</TableHead>
                    <TableHead className="w-24">Applied</TableHead>
                    <TableHead className="w-10">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApplications.map((app) => (
                    <TableRow
                      key={app.id}
                      className="cursor-pointer"
                      onClick={() => handleOpenDetails(app)}
                    >
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                              {getDisplayName(app).charAt(0).toUpperCase() || 'C'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate max-w-[140px]">{getDisplayName(app)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="truncate max-w-[140px] py-2">{app.jobs?.title ?? '—'}</TableCell>
                      <TableCell className="truncate max-w-[160px] py-2">{getDisplayTitle(app)}</TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={app.status || 'applied'} />
                      </TableCell>
                      <TableCell className="text-right py-2">
                        {app.ai_match_score ? <ScoreBadge score={app.ai_match_score} size="sm" showLabel={false} /> : '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2">{format(new Date(app.applied_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="py-2">
                        {app.recruiter_rating ? (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-xs">{app.recruiter_rating}</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
      <ScrollToTop />
    </DashboardLayout>
  );
}
