import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Briefcase, Users, TrendingUp, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface AnalyticsData {
  totalJobs: number;
  publishedJobs: number;
  totalApplications: number;
  totalCandidates: number;
  applicationsByStatus: { status: string; count: number }[];
}

export default function ManagerAnalytics() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AnalyticsData>({
    totalJobs: 0,
    publishedJobs: 0,
    totalApplications: 0,
    totalCandidates: 0,
    applicationsByStatus: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchAnalytics();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

  const fetchAnalytics = async () => {
    if (!organizationId) return;
    
    try {
      // Fetch jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('organization_id', organizationId);
      
      const totalJobs = jobs?.length || 0;
      const publishedJobs = jobs?.filter(j => j.status === 'published').length || 0;

      // Fetch candidates in org
      const { data: candidates } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('organization_id', organizationId);

      // Fetch applications for org's jobs
      const jobIds = jobs?.map(j => j.id) || [];
      let totalApplications = 0;
      const statusCounts: Record<string, number> = {};
      
      if (jobIds.length > 0) {
        const { data: applications } = await supabase
          .from('applications')
          .select('id, status')
          .in('job_id', jobIds);
        
        totalApplications = applications?.length || 0;
        
        applications?.forEach(app => {
          const status = app.status || 'applied';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
      }

      setData({
        totalJobs,
        publishedJobs,
        totalApplications,
        totalCandidates: candidates?.length || 0,
        applicationsByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Organization not assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your account manager role is active, but it isn’t linked to an organization yet. Please ask a platform admin to re-invite
              you or reassign you to a tenant.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Organization hiring metrics and insights</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Jobs" value={data.totalJobs.toString()} icon={Briefcase} />
          <StatCard title="Published Jobs" value={data.publishedJobs.toString()} icon={TrendingUp} />
          <StatCard title="Total Applications" value={data.totalApplications.toString()} icon={Users} />
          <StatCard title="Candidates in Org" value={data.totalCandidates.toString()} icon={Users} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Applications by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.applicationsByStatus.length === 0 ? (
              <p className="text-muted-foreground text-sm">No application data yet.</p>
            ) : (
              <div className="space-y-4">
                {data.applicationsByStatus.map((item) => (
                  <div key={item.status} className="flex items-center gap-4">
                    <span className="w-24 text-sm text-muted-foreground capitalize">{item.status}</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-accent" 
                        style={{ width: `${(item.count / data.totalApplications) * 100}%` }} 
                      />
                    </div>
                    <span className="w-12 text-sm font-medium text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}