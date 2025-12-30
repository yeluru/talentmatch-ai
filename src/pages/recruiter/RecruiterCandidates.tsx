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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Search, 
  MapPin, 
  Briefcase,
  Loader2,
  Users,
  Star,
  FileText,
  Sparkles,
  Phone,
  Mail,
  Linkedin,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { StatusBadge, ApplicationStatus } from '@/components/ui/status-badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MobileListHeader } from '@/components/ui/mobile-list-header';
import { SwipeableRow } from '@/components/ui/swipeable-row';

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

      {/* AI Match Score */}
      {selectedApplication?.ai_match_score && (
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <Sparkles className="h-5 w-5 text-accent" />
          <div>
            <div className="font-medium">AI Match Score</div>
            <div className="text-sm text-muted-foreground">
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
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <a 
              href={Array.isArray(selectedApplication.resumes) ? selectedApplication.resumes[0]?.file_url : selectedApplication.resumes?.file_url} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <FileText className="h-4 w-4 mr-2" />
              View Resume
            </a>
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
                className={`h-6 w-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
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
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

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
      queryClient.invalidateQueries({ queryKey: ['recruiter-applications'] });
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <div className="text-sm text-muted-foreground">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
        <CardContent className="pt-6">
            {!filteredApplications?.length ? (
              <EmptyState
                icon={Users}
                title="No candidates found"
                description={applications?.length ? "Try adjusting your filters" : "Applications will appear here when candidates apply"}
              />
            ) : (
              <div className="divide-y">
                {filteredApplications.map((app) => {
                  const rowContent = (
                    <div 
                      className="py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 px-6 transition-colors active:bg-muted bg-background"
                      onClick={() => handleOpenDetails(app)}
                    >
                      <div className="flex items-start gap-4">
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            {getDisplayName(app).charAt(0).toUpperCase() || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold">{getDisplayName(app)}</h3>
                            <StatusBadge status={(app.status || 'applied') as ApplicationStatus} />
                            {app.ai_match_score && (
                              <ScoreBadge score={app.ai_match_score} size="sm" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getDisplayTitle(app)} • {getDisplayExperience(app)} years exp.
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                            {getDisplayEmail(app) && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[200px]">{getDisplayEmail(app)}</span>
                              </span>
                            )}
                            {getDisplayPhone(app) && !isMobile && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                {getDisplayPhone(app)}
                              </span>
                            )}
                            {getDisplayLinkedIn(app) && !isMobile && (
                              <a 
                                href={getDisplayLinkedIn(app)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:text-accent"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Linkedin className="h-3.5 w-3.5 shrink-0" />
                                LinkedIn
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[150px]">{app.jobs?.title}</span>
                            </span>
                            <span className="hidden sm:inline">Applied {format(new Date(app.applied_at), 'MMM d, yyyy')}</span>
                            <span className="sm:hidden">{format(new Date(app.applied_at), 'MMM d')}</span>
                          </div>
                        </div>
                        {app.recruiter_rating ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{app.recruiter_rating}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );

                  if (isMobile) {
                    return (
                      <SwipeableRow
                        key={app.id}
                        leftActions={[
                          {
                            icon: <CheckCircle className="h-5 w-5" />,
                            label: 'Shortlist',
                            className: 'bg-green-600 text-white',
                            onAction: () => {
                              updateApplication.mutate({ appId: app.id, status: 'shortlisted' });
                            },
                          },
                        ]}
                        rightActions={[
                          {
                            icon: <XCircle className="h-5 w-5" />,
                            label: 'Reject',
                            className: 'bg-destructive text-destructive-foreground',
                            onAction: () => {
                              updateApplication.mutate({ appId: app.id, status: 'rejected' });
                            },
                          },
                        ]}
                        className="-mx-6"
                      >
                        {rowContent}
                      </SwipeableRow>
                    );
                  }

                  return (
                    <div key={app.id} className="-mx-6">
                      {rowContent}
                    </div>
                  );
                })}
              </div>
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
