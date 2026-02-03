import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, MapPin, Clock, ArrowRight, FileText, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

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
  'applied', 'reviewing', 'screening', 'shortlisted', 'interviewing', 'offered',
]);
const CLOSED_STAGE_SET = new Set<string>(['hired', 'rejected', 'withdrawn']);

function statusLeadLabel(status: string): string {
  const s = (status || 'applied').toLowerCase();
  if (s === 'shortlisted') return 'Shortlisted';
  if (s === 'interviewing') return 'Interview stage';
  if (s === 'offered') return 'Offer received';
  if (s === 'reviewing' || s === 'screening') return 'In review';
  if (s === 'hired') return 'Hired';
  if (s === 'rejected') return 'Not moving forward';
  if (s === 'withdrawn') return 'Withdrawn';
  return 'Applied';
}

export default function MyApplications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (user) fetchApplications();
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
          id, status, applied_at, ai_match_score,
          job:jobs(id, title, location, is_remote, organization:organizations(name, logo_url))
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

  const activeCount = applications.filter(a => ACTIVE_STAGE_SET.has(String(a.status || ''))).length;
  const closedCount = applications.filter(a => CLOSED_STAGE_SET.has(String(a.status || ''))).length;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto w-full">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  My <span className="text-gradient-candidate">Applications</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                See where each application stands and what to do next.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <div className="shrink-0">
            <TabsList className="grid w-full max-w-md grid-cols-3 rounded-xl p-1 h-11 bg-muted/30 border border-blue-500/10">
              <TabsTrigger value="all" className="rounded-lg text-sm font-sans font-medium data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">
                All ({applications.length})
              </TabsTrigger>
              <TabsTrigger value="active" className="rounded-lg text-sm font-sans font-medium data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">
                Active ({activeCount})
              </TabsTrigger>
              <TabsTrigger value="closed" className="rounded-lg text-sm font-sans font-medium data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">
                Closed ({closedCount})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            {filteredApplications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-blue-500/20 bg-blue-500/5 py-14 px-6 text-center transition-all hover:bg-blue-500/10">
                <div className="h-14 w-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-display font-bold text-foreground">No applications yet</h3>
                <p className="mt-2 max-w-sm mx-auto text-muted-foreground font-sans text-base">
                  {activeTab === 'closed'
                    ? 'No closed applications.'
                    : 'Apply to jobs from the job search to see them here.'}
                </p>
                {activeTab !== 'closed' && (
                  <Button className="mt-6 rounded-lg h-11 px-6 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold" asChild>
                    <Link to="/candidate/jobs">Browse jobs <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} /></Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ul className="space-y-4">
                  {filteredApplications.map((app) => {
                    const status = String(app.status || 'applied');
                    const isActive = ACTIVE_STAGE_SET.has(status);
                    const isClosed = CLOSED_STAGE_SET.has(status);
                    const orgName = app.job.organization?.name || 'Company';

                    return (
                      <li key={app.id}>
                        <Link
                          to={`/candidate/jobs/${app.job.id}`}
                          className={cn(
                            'group block rounded-xl border transition-all duration-300 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2',
                            'hover:border-blue-500/30 hover:bg-blue-500/5 hover:shadow-md',
                            isActive && 'border-blue-500/20 bg-blue-500/5',
                            isClosed && 'border-border bg-card/50 opacity-90 hover:opacity-100',
                            !isActive && !isClosed && 'border-border bg-card'
                          )}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="flex gap-4 min-w-0">
                              <div className="shrink-0 w-12 h-12 rounded-xl bg-card flex items-center justify-center border border-border transition-transform duration-300 group-hover:scale-105">
                                {app.job.organization?.logo_url ? (
                                  <img src={app.job.organization.logo_url} alt="" className="w-8 h-8 object-contain" />
                                ) : (
                                  <Building2 className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                                )}
                              </div>
                              <div className="min-w-0">
                                {isActive && (
                                  <p className="text-xs font-sans font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                                    {statusLeadLabel(status)}
                                  </p>
                                )}
                                <h3 className="font-display font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{app.job.title}</h3>
                                <p className="text-sm font-sans text-muted-foreground mt-0.5">{orgName}</p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground">
                                  {app.job.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" strokeWidth={1.5} /> {app.job.location}
                                    </span>
                                  )}
                                  {app.job.is_remote && (
                                    <span className="text-emerald-600 dark:text-emerald-400">Remote</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" strokeWidth={1.5} /> Applied {format(new Date(app.applied_at), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                              <StatusBadge status={app.status || 'applied'} />
                              {app.ai_match_score != null && (
                                <span className="text-xs font-sans text-muted-foreground">{app.ai_match_score}% match</span>
                              )}
                              <span className="text-sm font-sans font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 sm:mt-1 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                                View job <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
