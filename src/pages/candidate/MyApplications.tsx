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
import { StatusBadge } from '@/components/ui/status-badge';

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

const ACTIVE_STAGE_SET = new Set<string>([
  'applied',
  'reviewing',
  'screening',
  'shortlisted',
  'interviewing',
  'offered',
]);
const CLOSED_STAGE_SET = new Set<string>(['hired', 'rejected', 'withdrawn']);

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
        .select('id, updated_at')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const cp = (cpData || [])[0] as any;
      if (!cp?.id) return;

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
        .eq('candidate_id', cp.id)
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
    if (activeTab === 'active') return ACTIVE_STAGE_SET.has(String(app.status || ''));
    if (activeTab === 'closed') return CLOSED_STAGE_SET.has(String(app.status || ''));
    return true;
  });

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
          <p className="mt-1">
            Track your job applications and their status
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">
              All ({applications.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active ({applications.filter(a => ACTIVE_STAGE_SET.has(String(a.status || ''))).length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed ({applications.filter(a => CLOSED_STAGE_SET.has(String(a.status || ''))).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {filteredApplications.length === 0 ? (
              <div className="glass-panel border-dashed border-2 py-12 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold mb-2">No applications yet</h3>
                <p className="max-w-md text-muted-foreground mb-6">
                  You haven't applied to any jobs yet. Start browsing opportunities to see your applications here.
                </p>
                <Button asChild className="btn-primary-glow">
                  <Link to="/candidate/jobs">
                    Browse Jobs <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredApplications.map((app) => {
                  return (
                    <div key={app.id} className="glass-panel p-5 hover-card-premium">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center flex-shrink-0 border border-white/10">
                            {app.job.organization?.logo_url ? (
                              <img src={app.job.organization.logo_url} alt="" className="h-8 w-8 object-contain" />
                            ) : (
                              <Building2 className="h-6 w-6 text-muted-foreground/60" />
                            )}
                          </div>
                          <div>
                            <Link to={`/candidate/jobs/${app.job.id}`} className="block hover:text-accent transition-colors">
                              <h3 className="font-bold text-lg">{app.job.title}</h3>
                            </Link>
                            <p className="text-sm font-medium text-muted-foreground">{app.job.organization?.name}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {app.job.location && (
                                <span className="flex items-center">
                                  <MapPin className="mr-1 h-3 w-3" />
                                  {app.job.location}
                                </span>
                              )}
                              {app.job.is_remote && (
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Remote
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 min-w-[140px]">
                          <StatusBadge status={app.status || 'applied'} />

                          <div className="flex items-center gap-4 md:gap-2 text-xs text-muted-foreground">
                            {app.ai_match_score && (
                              <span className="flex items-center gap-1 font-medium text-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                {app.ai_match_score}% Match
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(app.applied_at), 'MMM d')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
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
