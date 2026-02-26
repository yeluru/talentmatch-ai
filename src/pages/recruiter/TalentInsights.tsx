import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  BarChart3,
  Sparkles,
  Loader2,
  Users,
  TrendingUp,
  Building2,
  GraduationCap,
  Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardAnalytics } from '@/components/recruiter/DashboardAnalytics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface SkillDistribution {
  skill: string;
  count: number;
  percentage: number;
}

interface ExperienceDistribution {
  range: string;
  count: number;
  percentage: number;
}

interface Insights {
  summary: string;
  total_candidates: number;
  skills_distribution: SkillDistribution[];
  experience_distribution: ExperienceDistribution[];
  top_companies?: { company: string; count: number }[];
  recommendations?: string[];
}

const COLORS = ['hsl(var(--accent))', 'hsl(var(--primary))', 'hsl(var(--secondary))', '#82ca9d', '#ffc658', '#8884d8'];

export default function TalentInsights() {
  const { roles } = useAuth();
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [insights, setInsights] = useState<Insights | null>(null);
  
  const organizationId = orgIdForRecruiterSuite(roles);
  const STORAGE_KEY_PREFIX = useMemo(
    () => `recruiter:talent-insights:last:${organizationId || 'no-org'}`,
    [organizationId],
  );

  // Restore persisted selection + last generated insights (per job filter)
  useEffect(() => {
    if (!organizationId) return;
    try {
      const savedJob = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}:selectedJob`);
      if (savedJob) setSelectedJob(savedJob);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    try {
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}:selectedJob`, selectedJob);
    } catch {
      // ignore
    }
  }, [STORAGE_KEY_PREFIX, organizationId, selectedJob]);

  useEffect(() => {
    if (!organizationId) return;
    try {
      const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}:job:${selectedJob}`);
      if (!raw) {
        setInsights(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.insights) setInsights(parsed.insights as Insights);
    } catch {
      // ignore
    }
  }, [STORAGE_KEY_PREFIX, organizationId, selectedJob]);

  // Fetch jobs for filter
  const { data: jobs } = useQuery({
    queryKey: ['org-jobs', organizationId],
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

  // Fetch candidates
  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['org-candidates-insights', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data: profiles, error } = await supabase
        .from('candidate_profiles')
        .select('id, current_title, years_of_experience, summary, user_id, current_company')
        .eq('organization_id', organizationId);
      
      if (error) throw error;

      const userIds = profiles?.map(p => p.user_id) || [];
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const candidateIds = profiles?.map(p => p.id) || [];
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return profiles?.map(p => ({
        id: p.id,
        name: userProfiles?.find(up => up.user_id === p.user_id)?.full_name || 'Unknown',
        title: p.current_title,
        years_experience: p.years_of_experience,
        summary: p.summary,
        company: p.current_company,
        skills: skills?.filter(s => s.candidate_id === p.id).map(s => s.skill_name) || []
      })) || [];
    },
    enabled: !!organizationId,
  });

  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      if (!candidates?.length) throw new Error('No candidates to analyze');
      
      const jobContext = selectedJob !== 'all' 
        ? jobs?.find(j => j.id === selectedJob)?.title 
        : undefined;

      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { candidates, jobContext }
      });

      if (error) throw error;
      return data as Insights;
    },
    onSuccess: (data) => {
      setInsights(data);
      try {
        sessionStorage.setItem(
          `${STORAGE_KEY_PREFIX}:job:${selectedJob}`,
          JSON.stringify({ ts: Date.now(), job: selectedJob, insights: data }),
        );
      } catch {
        // ignore
      }
      toast.success('Insights generated successfully');
    },
    onError: (error: any) => {
      console.error('Insights error:', error);
      toast.error(error.message || 'Failed to generate insights');
    },
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-recruiter/10 dark:bg-recruiter/20 border-2 border-recruiter/70 dark:border-white/50">
              <BarChart3 className="h-5 w-5 text-recruiter/60 dark:text-recruiter" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
              Talent <span className="text-gradient-recruiter">Insights</span>
            </h1>
          </div>
          <p className="text-lg text-muted-foreground font-sans">Visualize your candidate pool with AI-powered analytics</p>
        </div>

        {/* Moved from Recruiter Dashboard: Pipeline Snapshot */}
        <div className="card-elevated p-4 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Pipeline snapshot</h2>
              <p className="text-sm">
                Application trends, stage mix, and conversion funnel across your org’s jobs.
              </p>
            </div>
            <Badge variant="secondary" className="bg-accent/10 text-accent">
              Live
            </Badge>
          </div>
          <DashboardAnalytics />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Insights</CardTitle>
            <CardDescription>
              Analyze your talent pool to understand skills distribution, experience levels, and market trends
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Select value={selectedJob} onValueChange={setSelectedJob}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Filter by job (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Candidates</SelectItem>
                  {jobs?.map((job) => (
                    <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => generateInsightsMutation.mutate()}
                disabled={generateInsightsMutation.isPending || candidatesLoading || !candidates?.length}
              >
                {generateInsightsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Insights
              </Button>
            </div>
            <p className="text-sm">
              {candidates?.length || 0} candidates available for analysis
            </p>
          </CardContent>
        </Card>

        {insights && (
          <>
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-warning" />
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="">{insights.summary}</p>
                <div className="flex items-center gap-2 mt-4">
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    <Users className="h-4 w-4 mr-2" />
                    {insights.total_candidates} Total Candidates
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Skills Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Skills Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={insights.skills_distribution?.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="skill" tick={{ fontSize: 12 }} interval={0} angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Experience Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Experience Levels
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={insights.experience_distribution}
                          dataKey="count"
                          nameKey="range"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ range, percentage }) => `${range} (${percentage}%)`}
                        >
                          {insights.experience_distribution?.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Companies */}
              {insights.top_companies && insights.top_companies.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Top Companies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {insights.top_companies.slice(0, 6).map((company, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span className="font-medium">{company.company}</span>
                          <Badge variant="secondary">{company.count} candidates</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recommendations */}
              {insights.recommendations && insights.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-accent" />
                      AI Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {insights.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-accent mt-1">•</span>
                          <span className="">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {!candidatesLoading && (!candidates || candidates.length === 0) && (
          <EmptyState
            icon={Users}
            title="No candidates to analyze"
            description="Invite candidates to join your organization to generate insights"
          />
        )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
