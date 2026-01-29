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
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ApplicantDetailSheet } from '@/components/recruiter/ApplicantDetailSheet';
import { openResumeInNewTab } from '@/lib/resumeLinks';
import { StatusBadge } from '@/components/ui/status-badge';
import { APPLICATION_STAGE_OPTIONS } from '@/lib/statusOptions';

export default function JobApplicants() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">{job?.title}</h1>
            <p className="">
              {applications?.length || 0} applicant{applications?.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/recruiter/jobs/${jobId}/edit`)}>
            Edit Job
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <Input
              placeholder="Search applicants..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
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
          <EmptyState
            icon={Briefcase}
            title="No applicants yet"
            description={searchQuery || statusFilter !== 'all' 
              ? "No applicants match your filters" 
              : "Applications will appear here when candidates apply"}
          />
        ) : (
          <div className="space-y-3">
            {filteredApplications.map((application, idx) => (
              <Card 
                key={application.id} 
                className={`hover:border-primary/30 transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-secondary/60' : ''}`}
                onClick={() => handleOpenDetail(application.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarFallback className="bg-accent text-accent-foreground">
                        {application.candidate_profiles?.full_name?.charAt(0) || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">
                            {application.candidate_profiles?.full_name || 'Unknown'}
                          </h3>
                          <p className="text-sm">
                            {application.candidate_profiles?.current_title}
                            {application.candidate_profiles?.current_company && 
                              ` at ${application.candidate_profiles.current_company}`}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {application.ai_match_score && (
                            <ScoreBadge score={application.ai_match_score} />
                          )}
                          <StatusBadge status={application.status || 'applied'} />
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                        {application.candidate_profiles?.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {application.candidate_profiles.email}
                          </span>
                        )}
                        {application.candidate_profiles?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {application.candidate_profiles.location}
                          </span>
                        )}
                        <span>
                          Applied {formatDistanceToNow(new Date(application.applied_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {application.resumes && (Array.isArray(application.resumes) ? application.resumes.length > 0 : true) ? (
                          <DropdownMenuItem
                            onClick={async () => { await openResume(application.resumes); }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Resume
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => updateStatus.mutate({ 
                            applicationId: application.id, 
                            status: 'screening' 
                          })}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Move to Screening
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateStatus.mutate({ 
                            applicationId: application.id, 
                            status: 'interviewing' 
                          })}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Move to Interviewing
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateStatus.mutate({ 
                            applicationId: application.id, 
                            status: 'rejected' 
                          })}
                          className="text-destructive"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <ApplicantDetailSheet
          applicationId={selectedApplicationId}
          open={detailSheetOpen}
          onOpenChange={setDetailSheetOpen}
        />
      </div>
    </DashboardLayout>
  );
}
