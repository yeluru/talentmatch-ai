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

const statusColors: Record<string, string> = {
  applied: 'bg-blue-500/10 text-blue-500',
  screening: 'bg-yellow-500/10 text-yellow-500',
  interviewing: 'bg-purple-500/10 text-purple-500',
  offered: 'bg-green-500/10 text-green-500',
  hired: 'bg-emerald-500/10 text-emerald-500',
  rejected: 'bg-red-500/10 text-red-500',
};

export default function JobApplicants() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-applicants', jobId] });
      toast.success('Application status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

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
            <p className="text-muted-foreground">
              {applications?.length || 0} applicant{applications?.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/recruiter/jobs/${jobId}/edit`)}>
            Edit Job
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="screening">Screening</SelectItem>
              <SelectItem value="interviewing">Interviewing</SelectItem>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
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
            {filteredApplications.map((application) => (
              <Card key={application.id} className="hover:border-primary/30 transition-colors">
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
                          <p className="text-sm text-muted-foreground">
                            {application.candidate_profiles?.current_title}
                            {application.candidate_profiles?.current_company && 
                              ` at ${application.candidate_profiles.current_company}`}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {application.ai_match_score && (
                            <ScoreBadge score={application.ai_match_score} />
                          )}
                          <Badge className={statusColors[application.status || 'applied']}>
                            {application.status || 'applied'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
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
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {application.resumes && (
                          <DropdownMenuItem asChild>
                            <a 
                              href={application.resumes.file_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              View Resume
                            </a>
                          </DropdownMenuItem>
                        )}
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
      </div>
    </DashboardLayout>
  );
}
