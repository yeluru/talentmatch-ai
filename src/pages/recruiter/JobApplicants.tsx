import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Search,
  MoreVertical,
  Mail,
  Eye,
  Check,
  X,
  FileText,
  Briefcase,
  MapPin,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ApplicantDetailSheet } from '@/components/recruiter/ApplicantDetailSheet';
import { openResumeInNewTab } from '@/lib/resumeLinks';
import { StatusBadge } from '@/components/ui/status-badge';
import { APPLICATION_STAGE_OPTIONS } from '@/lib/statusOptions';
import { useAuth } from '@/hooks/useAuth';
import { effectiveRecruiterOwnerId } from '@/lib/org';

export default function JobApplicants() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentRole, user } = useAuth();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId, ownerId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      let q = supabase.from('jobs').select('*').eq('id', jobId);
      if (ownerId) q = q.eq('recruiter_id', ownerId);
      const { data, error } = await q.single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ['job-applicants', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          candidate_profiles (
            id,
            full_name,
            email,
            current_title,
            current_company,
            location,
            years_of_experience
          ),
          resumes (
            id,
            file_name,
            file_url
          )
        `)
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ applicationId, status }: { applicationId: string; status: string }) => {
      // Get application details for notification
      const { data: app } = await supabase
        .from('applications')
        .select('candidate_id, job_id, status')
        .eq('id', applicationId)
        .single();

      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', applicationId);
      if (error) throw error;

      // Trigger notification
      if (app) {
        try {
          await supabase.functions.invoke('notify-application', {
            body: {
              type: 'status_change',
              applicationId,
              candidateId: app.candidate_id,
              jobId: app.job_id,
              oldStatus: app.status,
              newStatus: status,
            },
          });
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-applicants', jobId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['application-detail'], exact: false });
      toast.success('Application status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const openResume = async (resumes: any) => {
    try {
      const fileUrl = Array.isArray(resumes) ? resumes[0]?.file_url : resumes?.file_url;
      await openResumeInNewTab(fileUrl, { expiresInSeconds: 600 });
    } catch (e: any) {
      toast.error(e?.message || 'Could not open resume');
    }
  };

  const handleOpenDetail = (applicationId: string) => {
    setSelectedApplicationId(applicationId);
    setDetailSheetOpen(true);
  };

  const filteredApplications = applications?.filter(app => {
    const matchesSearch = !searchQuery ||
      app.candidate_profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.candidate_profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.candidate_profiles?.current_title?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;

    return matchesSearch && matchesStatus;
  }) || [];

  const isLoading = jobLoading || applicationsLoading;

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

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-lg -ml-2 text-muted-foreground hover:text-recruiter hover:bg-recruiter/5 font-sans shrink-0">
                  <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Jobs
                </Button>
              </div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground truncate">
                  {job?.title}
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans flex items-center gap-2">
                <Users className="h-4 w-4 opacity-70" strokeWidth={1.5} />
                {applications?.length || 0} applicant{applications?.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(`/recruiter/jobs/${jobId}/edit`)} className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold shrink-0">
              Edit Job
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 rounded-xl border border-border bg-card p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search applicants..."
              className="pl-10 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {APPLICATION_STAGE_OPTIONS.filter((o) => o.value !== 'reviewed').map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredApplications.length === 0 ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState
              icon={Briefcase}
              title="No applicants yet"
              description={searchQuery || statusFilter !== 'all'
                ? "No applicants match your filters"
                : "Applications will appear here when candidates apply"}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredApplications.map((application) => (
              <div
                key={application.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenDetail(application.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetail(application.id); } }}
                className="group rounded-xl border border-border bg-card p-4 transition-all duration-300 cursor-pointer hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2"
              >
                <div className="relative z-10 flex items-start gap-4">
                  <Avatar className="h-12 w-12 shrink-0 border border-recruiter/20">
                    <AvatarFallback className="bg-recruiter/10 text-recruiter font-bold font-sans">
                      {application.candidate_profiles?.full_name?.charAt(0) || 'C'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-recruiter transition-colors">
                          {application.candidate_profiles?.full_name || (application.candidate_profiles?.email ? String(application.candidate_profiles.email).split('@')[0] : null) || 'Applicant'}
                        </h3>
                        <p className="text-sm text-muted-foreground font-sans">
                          {application.candidate_profiles?.current_title}
                          {application.candidate_profiles?.current_company &&
                            ` at ${application.candidate_profiles.current_company}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {application.ai_match_score && (
                          <ScoreBadge score={application.ai_match_score} />
                        )}
                        <StatusBadge status={application.status || 'applied'} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-recruiter/10 hover:text-recruiter">
                              <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-xl border border-border bg-card">
                      {application.resumes && (Array.isArray(application.resumes) ? application.resumes.length > 0 : true) ? (
                        <DropdownMenuItem
                          onClick={async () => { await openResume(application.resumes); }}
                        >
                          <FileText className="h-4 w-4 mr-2" strokeWidth={1.5} />
                          View Resume
                        </DropdownMenuItem>
                      ) : null}

                      <div className="h-px bg-border my-1" />

                      <DropdownMenuItem
                        onClick={() => updateStatus.mutate({
                          applicationId: application.id,
                          status: 'screening'
                        })}
                      >
                        <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Move to Screening
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateStatus.mutate({
                          applicationId: application.id,
                          status: 'interviewing'
                        })}
                      >
                        <Check className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Move to Interviewing
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateStatus.mutate({
                          applicationId: application.id,
                          status: 'rejected'
                        })}
                        className="text-red-500 focus:text-red-600"
                      >
                        <X className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Reject
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}

        <ApplicantDetailSheet
          applicationId={selectedApplicationId}
          open={detailSheetOpen}
          onOpenChange={setDetailSheetOpen}
        />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
