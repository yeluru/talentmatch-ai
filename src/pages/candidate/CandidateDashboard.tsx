import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Briefcase, Sparkles, TrendingUp, ArrowRight, Loader2, Target, Trophy, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo } from 'react';

export default function CandidateDashboard() {
  const { user } = useAuth();

  // Fetch candidate profile
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

  // Fetch real application count
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

  // Fetch skill count
  const { data: skills, isLoading: skillsLoading } = useQuery({
    queryKey: ['candidate-skills-count', candidateProfile?.id],
    queryFn: async () => {
      if (!candidateProfile?.id) return [];
      const { data, error } = await supabase
        .from('candidate_skills')
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


  const stats = useMemo(() => [
    {
      label: 'Applications',
      value: applications?.length || 0,
      icon: Briefcase,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      trend: '+2 this week'
    },
    {
      label: 'Resumes',
      value: resumes?.length || 0,
      icon: FileText,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      trend: 'Optimize now'
    },
    {
      label: 'Skills Verified',
      value: skills?.length || 0,
      icon: Target,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      trend: 'Top 10%'
    },
    {
      label: 'Profile Score',
      value: latestAnalysis?.match_score ? `${latestAnalysis.match_score}%` : 'N/A',
      icon: Trophy,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      trend: 'AI Analyzed'
    }
  ], [applications, resumes, skills, latestAnalysis]);

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-in-view">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-gradient-premium">
              Welcome back, {candidateProfile?.full_name?.split(' ')[0] || 'Candidate'}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Here's what's happening with your job search today.
            </p>
          </div>
          <div className="flex gap-3">
            <Button className="btn-premium" asChild>
              <Link to="/candidate/jobs">
                <Sparkles className="mr-2 h-4 w-4" />
                Find Jobs
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-panel p-6 rounded-xl hover-card-premium relative overflow-hidden group">
              <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500`}>
                <stat.icon className={`h-24 w-24 ${stat.color}`} />
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className={`h-12 w-12 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4 shadow-sm ring-1 ring-inset ring-white/10`}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">{stat.label}</h3>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-display font-bold text-foreground tracking-tight">{stat.value}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-xs font-medium text-muted-foreground/80 bg-white/5 border border-white/5 px-2 py-1 rounded-md">
                    {stat.trend}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Applications */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Recent Applications
              </h2>
              <Button variant="ghost" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                <Link to="/candidate/applications">View All <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden hover-card-premium">
              {appsLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : applications && applications.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {applications.map((app: any) => (
                    <div key={app.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shadow-inner ring-1 ring-inset ring-white/10">
                          {app.job.organization?.name?.[0] || 'C'}
                        </div>
                        <div>
                          <h4 className="font-semibold text-lg group-hover:text-primary transition-colors">{app.job.title}</h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Building2 className="h-3 w-3" />
                            {app.job.organization?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${app.status === 'applied' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          app.status === 'interviewing' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          }`}>
                          {app.status || 'Applied'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(app.applied_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                  <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Briefcase className="h-8 w-8 opacity-50" />
                  </div>
                  <p className="text-lg font-medium text-foreground">No active applications</p>
                  <p className="text-sm max-w-xs mx-auto mt-2 mb-6">You haven't applied to any jobs yet. Start your search today!</p>
                  <Button className="btn-premium" asChild>
                    <Link to="/candidate/jobs">Start applying now</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions / AI Insights */}
          <div className="space-y-6">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Recommended Actions
            </h2>
            <div className="glass-panel p-6 rounded-xl hover-card-premium space-y-6">
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Trophy className="h-24 w-24 text-primary" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-semibold">Profile Strength</h3>
                    </div>
                    <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden mb-2 border border-white/5">
                      <div className="bg-primary h-full rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" style={{ width: '75%' }} />
                    </div>
                    <p className="text-xs text-muted-foreground/80 mb-3">
                      Your profile is <span className="text-primary font-bold">75% complete</span>. Add more skills to increase visibility.
                    </p>
                    <Button size="sm" className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20" asChild>
                      <Link to="/candidate/profile">Complete Profile</Link>
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link to="/candidate/resumes">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group flex items-start gap-4 hover:border-purple-500/30">
                      <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors ring-1 ring-inset ring-purple-500/20">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm group-hover:text-purple-400 transition-colors">Resume Analysis</h4>
                        <p className="text-xs text-muted-foreground mt-1">Get AI feedback on your resume to improve your score.</p>
                      </div>
                    </div>
                  </Link>

                  <Link to="/candidate/job-alerts">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group flex items-start gap-4 hover:border-amber-500/30">
                      <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors ring-1 ring-inset ring-amber-500/20">
                        <Target className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm group-hover:text-amber-400 transition-colors">Job Alerts</h4>
                        <p className="text-xs text-muted-foreground mt-1">Configure your search preferences and get notified.</p>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
