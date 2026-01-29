import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Users, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Job {
  id: string;
  title: string;
  location: string | null;
  status: string;
  applications_count: number;
  posted_at: string | null;
  is_remote: boolean;
}

export default function ManagerJobs() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchJobs();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

  const fetchJobs = async () => {
    if (!organizationId) return;
    
    try {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, location, status, applications_count, posted_at, is_remote')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (data) {
        setJobs(data);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not posted';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-success/10 text-success';
      case 'draft': return 'bg-muted';
      case 'closed': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted';
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
            <p className="text-sm">
              Your account manager role is active, but it isn’t linked to an organization yet. Ask a platform admin to re-invite you or
              reassign you to a tenant.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const publishedJobs = jobs.filter(j => j.status === 'published');
  const draftJobs = jobs.filter(j => j.status === 'draft');
  const closedJobs = jobs.filter(j => j.status === 'closed');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Jobs Overview</h1>
          <p className="mt-1">All jobs in your organization</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-success">{publishedJobs.length}</p>
                <p className="text-smmt-1">Published</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold">{draftJobs.length}</p>
                <p className="text-smmt-1">Drafts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-destructive">{closedJobs.length}</p>
                <p className="text-smmt-1">Closed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm">No jobs created yet.</p>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div className="space-y-1">
                      <p className="font-medium">{job.title}</p>
                      <div className="flex items-center gap-4 text-sm">
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {job.location}
                            {job.is_remote && ' (Remote)'}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(job.posted_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-4 w-4" />
                        {job.applications_count || 0} applicants
                      </div>
                      <Badge className={getStatusColor(job.status || 'draft')}>
                        {job.status || 'draft'}
                      </Badge>
                    </div>
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