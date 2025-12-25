import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, MapPin, Clock, ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface Application {
  id: string;
  status: string | null;
  applied_at: string;
  ai_match_score: number | null;
  job: {
    id: string;
    title: string;
    location: string | null;
    is_remote: boolean | null;
    organization: { name: string; logo_url: string | null } | null;
  };
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  applied: { label: 'Applied', variant: 'secondary' },
  reviewing: { label: 'Under Review', variant: 'default' },
  shortlisted: { label: 'Shortlisted', variant: 'default' },
  interviewing: { label: 'Interviewing', variant: 'default' },
  offered: { label: 'Offer Extended', variant: 'default' },
  hired: { label: 'Hired', variant: 'default' },
  rejected: { label: 'Not Selected', variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
};

export default function MyApplications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (user) {
      fetchApplications();
    }
  }, [user]);

  const fetchApplications = async () => {
    try {
      const { data: cpData } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (!cpData) return;

      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          status,
          applied_at,
          ai_match_score,
          job:jobs(
            id,
            title,
            location,
            is_remote,
            organization:organizations(name, logo_url)
          )
        `)
        .eq('candidate_id', cpData.id)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredApplications = applications.filter(app => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return ['applied', 'reviewing', 'shortlisted', 'interviewing', 'offered'].includes(app.status || '');
    if (activeTab === 'closed') return ['hired', 'rejected', 'withdrawn'].includes(app.status || '');
    return true;
  });

  const getStatusInfo = (status: string | null) => {
    return statusConfig[status || 'applied'] || statusConfig.applied;
  };

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
        <div>
          <h1 className="font-display text-3xl font-bold">My Applications</h1>
          <p className="text-muted-foreground mt-1">
            Track your job applications and their status
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">
              All ({applications.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active ({applications.filter(a => ['applied', 'reviewing', 'shortlisted', 'interviewing', 'offered'].includes(a.status || '')).length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed ({applications.filter(a => ['hired', 'rejected', 'withdrawn'].includes(a.status || '')).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {filteredApplications.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Start applying to jobs to see them here
                  </p>
                  <Button asChild>
                    <Link to="/candidate/jobs">
                      Browse Jobs <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredApplications.map((app) => {
                  const statusInfo = getStatusInfo(app.status);
                  return (
                    <Card key={app.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                              {app.job.organization?.logo_url ? (
                                <img src={app.job.organization.logo_url} alt="" className="h-8 w-8 object-contain" />
                              ) : (
                                <Building2 className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <Link to={`/candidate/jobs/${app.job.id}`} className="hover:underline">
                                <h3 className="font-semibold">{app.job.title}</h3>
                              </Link>
                              <p className="text-muted-foreground text-sm">{app.job.organization?.name}</p>
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                {app.job.location && (
                                  <span className="flex items-center">
                                    <MapPin className="mr-1 h-3 w-3" />
                                    {app.job.location}
                                  </span>
                                )}
                                {app.job.is_remote && (
                                  <Badge variant="outline" className="text-xs">Remote</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            {app.ai_match_score && (
                              <span className="text-sm">
                                <span className="text-muted-foreground">Match: </span>
                                <span className="font-semibold text-primary">{app.ai_match_score}%</span>
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground flex items-center">
                              <Clock className="mr-1 h-3 w-3" />
                              Applied {format(new Date(app.applied_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
