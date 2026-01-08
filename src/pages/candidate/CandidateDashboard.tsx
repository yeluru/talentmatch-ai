import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Briefcase, Sparkles, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';

export default function CandidateDashboard() {
  const { user, profile } = useAuth();

  // Fetch candidate profile
  const { data: candidateProfile } = useQuery({
    queryKey: ['candidate-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch real application count
  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['candidate-applications-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase
        .from('applications')
        .select('id, status, applied_at')
        .eq('candidate_id', candidateProfile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateProfile?.id,
  });

  // Fetch resume count
  const { data: resumes, isLoading: resumesLoading } = useQuery({
    queryKey: ['candidate-resumes-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('candidate_id', candidateProfile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateProfile?.id,
  });

  // Fetch latest AI analysis
  const { data: latestAnalysis } = useQuery({
    queryKey: ['latest-ai-analysis', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return null;
      const { data, error } = await supabase
        .from('ai_resume_analyses')
        .select('match_score')
        .eq('candidate_id', candidateProfile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!candidateProfile?.id,
  });

  // Calculate stats
  const applicationCount = applications?.length || 0;
  const recentApps = applications?.filter(a => {
    const appliedAt = new Date(a.applied_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return appliedAt > weekAgo;
  }).length || 0;

  const profileCompleteness = candidateProfile?.profile_completeness || 0;
  const matchScore = latestAnalysis?.match_score;

  const isLoading = appsLoading || resumesLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={
            <>
              Welcome back, <span className="text-accent">{profile?.full_name?.split(' ')[0] || 'there'}</span>
            </>
          }
          description="Your job search overview—applications, resume readiness, and AI feedback in one place."
          actions={
            <Button asChild className="btn-glow">
              <Link to="/candidate/jobs">
                Find jobs <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Profile Completeness"
                value={`${profileCompleteness}%`}
                change={profileCompleteness < 50 ? "Complete your profile" : profileCompleteness < 80 ? "Add more details" : "Looking great!"}
                changeType={profileCompleteness >= 80 ? "positive" : undefined}
                icon={TrendingUp}
                href="/candidate/profile"
              />
              <StatCard
                title="Applications"
                value={applicationCount.toString()}
                change={recentApps > 0 ? `+${recentApps} this week` : "Start applying!"}
                changeType={recentApps > 0 ? "positive" : undefined}
                icon={Briefcase}
                href="/candidate/applications"
              />
              <StatCard
                title="Resumes Uploaded"
                value={(resumes?.length || 0).toString()}
                change={resumes?.length ? "Ready to apply" : "Upload your resume"}
                changeType={resumes?.length ? "positive" : undefined}
                icon={FileText}
                href="/candidate/resumes"
              />
              <StatCard
                title="AI Match Score"
                value={matchScore ? `${matchScore}%` : "N/A"}
                change={matchScore ? (matchScore >= 80 ? "Excellent fit" : matchScore >= 60 ? "Good match" : "Room to improve") : "Run an analysis"}
                changeType={matchScore && matchScore >= 70 ? "positive" : undefined}
                icon={Sparkles}
                href="/candidate/ai-analysis"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    AI Resume Check
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Get instant AI-powered feedback on your resume. See how well you match job descriptions and get suggestions to improve.
                  </p>
                  <Button asChild>
                    <Link to="/candidate/ai-analysis">
                      Analyze My Resume <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Find Your Next Role</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Browse open positions and find jobs that match your skills and experience.
                  </p>
                  <Button variant="outline" asChild>
                    <Link to="/candidate/jobs">
                      Browse Jobs <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {!resumes?.length && (
              <Card className="border-dashed border-2 card-elevated">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Upload Your Resume</h3>
                  <p className="text-muted-foreground mb-4 max-w-md">
                    To start applying for jobs and use AI analysis, upload your resume first.
                  </p>
                  <Button asChild>
                    <Link to="/candidate/resumes">
                      Upload Resume <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
