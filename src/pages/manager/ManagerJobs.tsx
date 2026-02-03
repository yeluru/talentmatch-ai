import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Users, Calendar, Briefcase } from 'lucide-react';
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
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Jobs <span className="text-gradient-manager">Overview</span></h1>
              </div>
            <p className="text-lg text-muted-foreground font-sans">Your account manager role is active, but it isn’t linked to an organization yet.</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-sans text-muted-foreground">
                  Ask a platform admin to re-invite you or reassign you to a tenant.
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const publishedJobs = jobs.filter(j => j.status === 'published');
  const draftJobs = jobs.filter(j => j.status === 'draft');
  const closedJobs = jobs.filter(j => j.status === 'closed');

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <Briefcase className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Jobs <span className="text-gradient-manager">Overview</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">
              All jobs in your organization
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-success">{publishedJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Published</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-foreground">{draftJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Drafts</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20 text-center">
            <p className="text-4xl font-display font-bold text-destructive">{closedJobs.length}</p>
            <p className="text-sm font-sans text-muted-foreground mt-1">Closed</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">All Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-sm font-sans text-muted-foreground">No jobs created yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="group p-4 rounded-xl border border-border hover:bg-manager/5 hover:border-manager/30 hover:shadow-md transition-all flex items-center justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="font-sans font-medium truncate">{job.title}</p>
                    <div className="flex items-center gap-4 text-sm font-sans text-muted-foreground flex-wrap">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" strokeWidth={1.5} />
                          {job.location}
                          {job.is_remote && ' (Remote)'}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" strokeWidth={1.5} />
                        {formatDate(job.posted_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1 text-sm font-sans text-muted-foreground">
                      <Users className="h-4 w-4" strokeWidth={1.5} />
                      {job.applications_count || 0} applicants
                    </div>
                    <Badge className={`font-sans ${getStatusColor(job.status || 'draft')}`}>
                      {job.status || 'draft'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}