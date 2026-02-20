import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { Loader2, TrendingUp, Users, Target } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface ApplicationTrend {
  date: string;
  applications: number;
}

interface PipelineStage {
  name: string;
  value: number;
  color: string;
}

interface ConversionData {
  stage: string;
  count: number;
  rate: number;
}

const PIPELINE_COLORS: Record<string, string> = {
  outreach: 'hsl(var(--chart-1))',
  applied: 'hsl(var(--chart-1))',
  rtr_rate: 'hsl(var(--chart-2))',
  document_check: 'hsl(var(--chart-2))',
  screening: 'hsl(var(--chart-3))',
  submission: 'hsl(var(--chart-3))',
  final_update: 'hsl(var(--chart-4))',
};

const STAGE_LABEL: Record<string, string> = {
  outreach: 'Engaged',
  applied: 'Applied',
  rtr_rate: 'RTR & rate',
  document_check: 'Doc check',
  screening: 'Screening',
  submission: 'Submission',
  final_update: 'Outcome',
};

export function DashboardAnalytics() {
  const { roles, organizationId } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [applicationTrends, setApplicationTrends] = useState<ApplicationTrend[]>([]);
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData[]>([]);

  const orgId = organizationId || orgIdForRecruiterSuite(roles);

  useEffect(() => {
    if (orgId) {
      fetchAnalyticsData();
    } else {
      setIsLoading(false);
    }
  }, [orgId]);

  const fetchAnalyticsData = async () => {
    if (!orgId) return;

    try {
      // Get job IDs for org
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('organization_id', orgId);

      const jobIds = jobs?.map(j => j.id) || [];

      if (jobIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // Fetch all applications for these jobs
      const { data: applications } = await supabase
        .from('applications')
        .select('id, applied_at, status')
        .in('job_id', jobIds);

      if (!applications || applications.length === 0) {
        setIsLoading(false);
        return;
      }

      // Calculate application trends (last 7 days)
      const trends: Record<string, number> = {};
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        trends[dateStr] = 0;
      }

      applications.forEach(app => {
        const dateStr = new Date(app.applied_at).toISOString().split('T')[0];
        if (trends[dateStr] !== undefined) {
          trends[dateStr]++;
        }
      });

      const trendData: ApplicationTrend[] = Object.entries(trends).map(([date, count]) => ({
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        applications: count,
      }));

      setApplicationTrends(trendData);

      // Calculate pipeline distribution
      const statusCounts: Record<string, number> = {};
      applications.forEach(app => {
        const status = app.status || 'applied';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      const pipeline: PipelineStage[] = Object.entries(statusCounts)
        .map(([name, value]) => ({
          name: STAGE_LABEL[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value,
          color: PIPELINE_COLORS[name] || 'hsl(var(--muted))',
        }));

      setPipelineData(pipeline);

      // Calculate conversion rates (recruiter pipeline stages only)
      const total = applications.length;
      const stages = ['outreach', 'applied', 'rtr_rate', 'document_check', 'screening', 'submission', 'final_update'];
      const conversions: ConversionData[] = stages.map(stage => {
        const count = statusCounts[stage] || 0;
        return {
          stage: STAGE_LABEL[stage] || stage.replace(/_/g, ' '),
          count,
          rate: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      });

      setConversionData(conversions);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (applicationTrends.length === 0 && pipelineData.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Application Trends */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-accent" />
            Application Trends
          </CardTitle>
          <CardDescription>Applications received over the last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={applicationTrends}>
                <defs>
                  <linearGradient id="applicationGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="applications"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  fill="url(#applicationGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hiring Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" />
            Pipeline
          </CardTitle>
          <CardDescription>Current candidates by stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-accent" />
            Conversion Funnel
          </CardTitle>
          <CardDescription>Conversion rates through each hiring stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversionData} layout="vertical">
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis 
                  type="category" 
                  dataKey="stage"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    `${props.payload.count} (${value}%)`,
                    'Candidates'
                  ]}
                />
                <Bar 
                  dataKey="rate" 
                  fill="hsl(var(--accent))" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
