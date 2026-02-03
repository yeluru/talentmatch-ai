import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Briefcase, Sparkles, Search, TrendingUp, ArrowRight, Loader2, Target, Trophy, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';

export default function CandidateDashboard() {
  const { user } = useAuth();

  const { data: candidateProfile } = useQuery({
    queryKey: ['candidate-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: rows, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) return null;
      return (rows || [])[0] || null;
    },
    enabled: !!user?.id,
  });

  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['candidate-applications-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase
        .from('applications')
        .select('id, status, applied_at, job:jobs(title, organization:organizations(name))')
        .eq('candidate_id', candidateProfile.id)
        .order('applied_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateProfile?.id,
  });

  const { data: resumes } = useQuery({
    queryKey: ['candidate-resumes-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase.from('resumes').select('id').eq('candidate_id', candidateProfile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateProfile?.id,
  });

  const { data: skills } = useQuery({
    queryKey: ['candidate-skills-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase.from('candidate_skills').select('id').eq('candidate_id', candidateProfile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!candidateProfile?.id,
  });

  const { data: latestAnalysis } = useQuery({
    queryKey: ['latest-ai-analysis', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return null;
      const { data, error } = await supabase
        .from('ai_resume_analyses')
        .select('match_score, full_analysis, created_at')
        .eq('candidate_id', candidateProfile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
    enabled: !!candidateProfile?.id,
  });

  const appCount = applications?.length ?? 0;
  const resumeCount = resumes?.length ?? 0;
  const skillCount = skills?.length ?? 0;
  const score = latestAnalysis?.match_score ?? null;

  // One clear hero message: what matters most right now
  const hero = useMemo(() => {
    if (appCount > 0)
      return {
        title: `${appCount} application${appCount === 1 ? '' : 's'} in progress`,
        subtitle: 'Track status and next steps in My Applications.',
        cta: 'View applications',
        href: '/candidate/applications',
        icon: Briefcase,
      };
    if (resumeCount === 0)
      return {
        title: 'Upload your first resume',
        subtitle: 'We’ll extract your skills and help you match with jobs.',
        cta: 'Upload resume',
        href: '/candidate/resumes',
        icon: FileText,
      };
    if (skillCount < 5)
      return {
        title: 'Strengthen your profile',
        subtitle: 'Add a few more skills to improve job matching.',
        cta: 'Edit profile',
        href: '/candidate/profile',
        icon: Target,
      };
    return {
      title: score != null ? `Your latest match score: ${score}%` : 'Ready to find your next role',
      subtitle: 'Search jobs or run an ATS check on your resume.',
      cta: 'Find jobs',
      href: '/candidate/jobs',
      icon: Search,
    };
  }, [appCount, resumeCount, skillCount, score]);

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto w-full">
        <div className="space-y-8">
        {/* Page header: greeting + primary action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground">
              Hi, <span className="text-gradient-candidate">{candidateProfile?.full_name?.split(' ')[0] || 'there'}</span>
            </h1>
            <p className="mt-1 text-muted-foreground">Here’s where things stand.</p>
          </div>
          <Button className="btn-candidate-primary h-11 px-5 rounded-full shrink-0" asChild>
            <Link to="/candidate/jobs">
              <Search className="mr-2 h-4 w-4" />
              Find jobs
            </Link>
          </Button>
        </div>

        {/* Hero: single focal point — next step or key number */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border border-blue-500/20 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-blue-500/20 p-3 shrink-0">
                <hero.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Suggested next step</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-display font-bold text-foreground">{hero.title}</h2>
                <p className="mt-1 text-muted-foreground">{hero.subtitle}</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-full border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 shrink-0" asChild>
              <Link to={hero.href}>
                {hero.cta}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Compact stats: one line, not four boxes */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground/80" />
            <strong className="font-semibold text-foreground">{appCount}</strong> applications
          </span>
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground/80" />
            <strong className="font-semibold text-foreground">{resumeCount}</strong> resumes
          </span>
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground/80" />
            <strong className="font-semibold text-foreground">{skillCount}</strong> skills
          </span>
          {score != null && (
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500/80" />
              <strong className="font-semibold text-foreground">{score}%</strong> last match score
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent applications: list with status as the visual driver */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-foreground">Recent applications</h2>
              {applications && applications.length > 0 && (
                <Link to="/candidate/applications" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {appsLoading ? (
              <div className="flex items-center justify-center py-12 rounded-xl border border-border/50 bg-muted/20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : applications && applications.length > 0 ? (
              <ul className="space-y-0 rounded-xl border border-border/50 bg-card overflow-hidden">
                {applications.map((app: any) => (
                  <li key={app.id}>
                    <Link
                      to={`/candidate/jobs/${app.job?.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-b-0"
                    >
                      <span className="shrink-0 w-2 h-10 rounded-full bg-blue-500/30" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{app.job?.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{app.job?.organization?.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground capitalize">
                          {app.status || 'Applied'}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(app.applied_at).toLocaleDateString()}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/10 py-10 px-6 text-center">
                <p className="text-muted-foreground">No applications yet.</p>
                <Button variant="outline" size="sm" className="mt-3 rounded-full" asChild>
                  <Link to="/candidate/jobs">Browse jobs</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Quick actions: one primary, rest as links */}
          <div className="space-y-3">
            <h2 className="text-lg font-display font-semibold text-foreground">Quick actions</h2>
            <div className="space-y-2">
              <Button className="w-full justify-start h-auto py-3 px-4 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border-0 font-medium" asChild>
                <Link to="/candidate/profile">
                  <Trophy className="mr-3 h-4 w-4 shrink-0" />
                  Complete profile
                </Link>
              </Button>
              <Link
                to="/candidate/resumes"
                className="flex items-center gap-3 w-full py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                Resume analysis
              </Link>
              <Link
                to="/candidate/job-alerts"
                className="flex items-center gap-3 w-full py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                Job alerts
              </Link>
            </div>
          </div>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
