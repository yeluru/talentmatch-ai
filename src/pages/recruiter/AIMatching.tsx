import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles,
  Loader2,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';

interface MatchResult {
  candidate_id: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  recommendation: string;
}

export default function AIMatching() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  // Fetch jobs
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['recruiter-jobs-matching', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'published');
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch candidates who applied for selected job
  const { data: applicants, isLoading: applicantsLoading } = useQuery({
    queryKey: ['job-applicants', selectedJob],
    queryFn: async () => {
      if (!selectedJob) return [];
      
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          candidate_id,
          ai_match_score,
          candidate_profiles!inner(
            id,
            current_title,
            years_of_experience,
            user_id
          )
        `)
        .eq('job_id', selectedJob);
      
      if (error) throw error;

      // Fetch profile names
      const userIds = data?.map(a => a.candidate_profiles?.user_id).filter(Boolean) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        
        // Fetch skills
        const candidateIds = data?.map(a => a.candidate_id) || [];
        const { data: skills } = await supabase
          .from('candidate_skills')
          .select('candidate_id, skill_name')
          .in('candidate_id', candidateIds);
        
        return data?.map(app => ({
          ...app,
          profile: profiles?.find(p => p.user_id === app.candidate_profiles?.user_id),
          skills: skills?.filter(s => s.candidate_id === app.candidate_id).map(s => s.skill_name) || []
        }));
      }
      
      return data;
    },
    enabled: !!selectedJob,
  });

  const runMatching = useMutation({
    mutationFn: async () => {
      if (!selectedJob || !applicants?.length) throw new Error('No job or applicants selected');
      
      const job = jobs?.find(j => j.id === selectedJob);
      if (!job) throw new Error('Job not found');

      const candidates = applicants.map(app => ({
        id: app.candidate_id,
        name: app.profile?.full_name || 'Unknown',
        title: app.candidate_profiles?.current_title,
        experience: app.candidate_profiles?.years_of_experience,
        skills: app.skills || []
      }));

      const { data, error } = await supabase.functions.invoke('match-candidates', {
        body: { job, candidates }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      setMatchResults(data.matches || []);
      
      // Update application scores in database
      for (const match of data.matches || []) {
        const app = applicants?.find(a => a.candidate_id === match.candidate_id);
        if (app) {
          await supabase
            .from('applications')
            .update({ 
              ai_match_score: match.match_score,
              ai_match_details: {
                matched_skills: match.matched_skills,
                missing_skills: match.missing_skills,
                recommendation: match.recommendation
              }
            })
            .eq('id', app.id);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['job-applicants'] });
      toast.success('AI matching complete!');
    },
    onError: (error: any) => {
      console.error('Matching error:', error);
      if (error.message?.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Please try again later.');
      } else {
        toast.error('Failed to run AI matching');
      }
    },
  });

  const selectedJobData = jobs?.find(j => j.id === selectedJob);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-accent" />
            AI Candidate Matching
          </h1>
          <p className="text-muted-foreground mt-1">
            Use AI to score and rank candidates for your job openings
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a Job</CardTitle>
            <CardDescription>
              Choose a job to run AI matching on its applicants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs?.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedJobData && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">{selectedJobData.title}</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedJobData.required_skills?.map((skill) => (
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {applicants?.length || 0} applicants
                </p>
              </div>
            )}

            <Button
              onClick={() => runMatching.mutate()}
              disabled={!selectedJob || !applicants?.length || runMatching.isPending}
              className="w-full"
            >
              {runMatching.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Running AI Analysis...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run AI Matching
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {matchResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Match Results</CardTitle>
              <CardDescription>
                Candidates ranked by AI match score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {matchResults
                  .sort((a, b) => b.match_score - a.match_score)
                  .map((result, index) => {
                    const applicant = applicants?.find(a => a.candidate_id === result.candidate_id);
                    return (
                      <div 
                        key={result.candidate_id}
                        className="flex items-start gap-4 p-4 border rounded-lg"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                          #{index + 1}
                        </div>
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            {applicant?.profile?.full_name?.charAt(0) || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">
                              {applicant?.profile?.full_name || 'Unknown'}
                            </h4>
                            <ScoreBadge score={result.match_score} />
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {result.recommendation}
                          </p>
                          
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-success" />
                                Matched Skills
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {result.matched_skills?.map((skill) => (
                                  <Badge key={skill} variant="secondary" className="text-xs bg-success/10 text-success border-success/20">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-warning" />
                                Missing Skills
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {result.missing_skills?.map((skill) => (
                                  <Badge key={skill} variant="outline" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedJob && !applicants?.length && !applicantsLoading && (
          <EmptyState
            icon={Users}
            title="No applicants yet"
            description="Wait for candidates to apply before running AI matching"
          />
        )}
      </div>
    </DashboardLayout>
  );
}
