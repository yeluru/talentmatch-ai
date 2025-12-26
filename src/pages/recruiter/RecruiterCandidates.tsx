import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  MapPin, 
  Briefcase,
  Loader2,
  Users,
  Star,
  FileText,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { StatusBadge } from '@/components/ui/status-badge';

type AppStatus = 'applied' | 'reviewing' | 'shortlisted' | 'interviewing' | 'offered' | 'rejected' | 'hired';

export default function RecruiterCandidates() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>(searchParams.get('job') || 'all');
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

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
  const { data: applications, isLoading } = useQuery({
    queryKey: ['recruiter-applications', organizationId, selectedJobFilter],
    queryFn: async () => {
      if (!organizationId) return [];
      
      let query = supabase
        .from('applications')
        .select(`
          *,
          jobs!inner(id, title, organization_id),
          candidate_profiles!inner(id, current_title, years_of_experience, user_id),
          resumes(id, file_name, file_url)
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
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        
        return data?.map(app => ({
          ...app,
          profile: profiles?.find(p => p.user_id === app.candidate_profiles?.user_id)
        }));
      }
      
      return data;
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

  const filteredApplications = applications?.filter(app => {
    const name = app.profile?.full_name || '';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.candidate_profiles?.current_title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenDetails = (app: any) => {
    setSelectedApplication(app);
    setNotes(app.recruiter_notes || '');
    setRating(app.recruiter_rating || 0);
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
        <div>
          <h1 className="font-display text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage job applicants
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search candidates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedJobFilter} onValueChange={setSelectedJobFilter}>
                <SelectTrigger className="w-full sm:w-48">
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
                <SelectTrigger className="w-full sm:w-40">
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
          </CardHeader>
          <CardContent>
            {!filteredApplications?.length ? (
              <EmptyState
                icon={Users}
                title="No candidates found"
                description={applications?.length ? "Try adjusting your filters" : "Applications will appear here when candidates apply"}
              />
            ) : (
              <div className="divide-y">
                {filteredApplications.map((app) => (
                  <div 
                    key={app.id} 
                    className="py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-6 px-6 transition-colors"
                    onClick={() => handleOpenDetails(app)}
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {app.profile?.full_name?.charAt(0) || 'C'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{app.profile?.full_name || 'Unknown'}</h3>
                          <StatusBadge status={(app.status || 'applied') as AppStatus} />
                          {app.ai_match_score && (
                            <ScoreBadge score={app.ai_match_score} size="sm" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {app.candidate_profiles?.current_title || 'No title'} • {app.candidate_profiles?.years_of_experience || 0} years exp.
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            {app.jobs?.title}
                          </span>
                          <span>Applied {format(new Date(app.applied_at), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      {app.recruiter_rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-medium">{app.recruiter_rating}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Candidate Details Dialog */}
      <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-accent text-accent-foreground">
                  {selectedApplication?.profile?.full_name?.charAt(0) || 'C'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div>{selectedApplication?.profile?.full_name || 'Unknown'}</div>
                <div className="text-sm font-normal text-muted-foreground">
                  {selectedApplication?.candidate_profiles?.current_title}
                </div>
              </div>
            </DialogTitle>
            <DialogDescription>
              Applied for {selectedApplication?.jobs?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
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
            {selectedApplication?.resumes?.length > 0 && (
              <div className="space-y-2">
                <Label>Resume</Label>
                <Button variant="outline" asChild>
                  <a 
                    href={selectedApplication.resumes[0].file_url} 
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
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
