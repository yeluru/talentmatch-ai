import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Building2, MapPin, Calendar, Users, Briefcase, Mail, Phone, ExternalLink, TrendingUp, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface JobDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  applications_count: number;
  posted_at: string | null;
  is_remote: boolean;
  recruiter_id: string;
  client_id: string | null;
  created_at: string;
  salary_min: number | null;
  salary_max: number | null;
  employment_type: string | null;
}

interface Client {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
}

interface Application {
  id: string;
  candidate_id: string;
  status: string;
  applied_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface PipelineStats {
  total: number;
  applied: number;
  reviewing: number;
  screening: number;
  interviewing: number;
  offered: number;
  hired: number;
  rejected: number;
}

export default function ManagerJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const { organizationId, isLoading: authLoading } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [recruiterName, setRecruiterName] = useState<string>('');
  const [pipelineStats, setPipelineStats] = useState<PipelineStats>({
    total: 0,
    applied: 0,
    reviewing: 0,
    screening: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
    rejected: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !jobId) return;
    if (organizationId) fetchJobDetails();
    else setIsLoading(false);
  }, [organizationId, authLoading, jobId]);

  const fetchJobDetails = async () => {
    if (!organizationId || !jobId) return;

    try {
      // Fetch job details
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('organization_id', organizationId)
        .single();

      if (jobError) throw jobError;
      if (!jobData) {
        toast.error('Job not found');
        return;
      }

      setJob(jobData as JobDetail);

      // Fetch client details if client_id exists
      if (jobData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('id', jobData.client_id)
          .single();

        if (clientData) setClient(clientData as Client);
      }

      // Fetch recruiter name
      const { data: recruiterData } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', jobData.recruiter_id)
        .single();

      if (recruiterData) {
        setRecruiterName(recruiterData.full_name || recruiterData.email || 'Unknown');
      }

      // Fetch applications
      const { data: applicationsData } = await supabase
        .from('applications')
        .select(`
          id,
          candidate_id,
          status,
          applied_at,
          profiles!applications_candidate_id_fkey (
            full_name,
            email
          )
        `)
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false });

      if (applicationsData) {
        setApplications(applicationsData as Application[]);

        // Calculate pipeline stats
        const stats: PipelineStats = {
          total: applicationsData.length,
          applied: 0,
          reviewing: 0,
          screening: 0,
          interviewing: 0,
          offered: 0,
          hired: 0,
          rejected: 0,
        };

        applicationsData.forEach((app: Application) => {
          switch (app.status) {
            case 'applied':
              stats.applied++;
              break;
            case 'reviewing':
              stats.reviewing++;
              break;
            case 'screening':
              stats.screening++;
              break;
            case 'interviewing':
              stats.interviewing++;
              break;
            case 'offered':
              stats.offered++;
              break;
            case 'hired':
              stats.hired++;
              break;
            case 'rejected':
              stats.rejected++;
              break;
          }
        });

        setPipelineStats(stats);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
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

  const getDaysOpen = () => {
    if (!job?.posted_at) return 0;
    const posted = new Date(job.posted_at);
    const now = new Date();
    return Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
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

  if (!job) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <p className="text-muted-foreground">Job not found</p>
          <Button asChild variant="outline">
            <Link to="/manager/jobs">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="shrink-0 flex flex-col gap-6 mb-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/manager/jobs">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Link>
            </Button>
          </div>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  {job.title}
                </h1>
                <Badge className={`font-sans ${getStatusColor(job.status || 'draft')}`}>
                  {job.status || 'draft'}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
                {client && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" strokeWidth={1.5} />
                    {client.name}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" strokeWidth={1.5} />
                    {job.location} {job.is_remote && '(Remote)'}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" strokeWidth={1.5} />
                  Posted {formatDate(job.posted_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" strokeWidth={1.5} />
                  {getDaysOpen()} days open
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to={`/recruiter/jobs/${job.id}/edit`}>
                  Edit Job
                </Link>
              </Button>
              <Button asChild className="bg-manager hover:bg-manager/90">
                <Link to={`/recruiter/pipeline?job=${job.id}`}>
                  View Pipeline
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pipeline Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-manager" strokeWidth={1.5} />
                  Pipeline Overview
                </CardTitle>
                <CardDescription>Candidate flow through hiring stages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Applications</span>
                    <span className="text-2xl font-bold">{pipelineStats.total}</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Applied', count: pipelineStats.applied, color: 'bg-blue-500' },
                      { label: 'Reviewing', count: pipelineStats.reviewing, color: 'bg-yellow-500' },
                      { label: 'Screening', count: pipelineStats.screening, color: 'bg-purple-500' },
                      { label: 'Interviewing', count: pipelineStats.interviewing, color: 'bg-indigo-500' },
                      { label: 'Offered', count: pipelineStats.offered, color: 'bg-green-500' },
                      { label: 'Hired', count: pipelineStats.hired, color: 'bg-success' },
                      { label: 'Rejected', count: pipelineStats.rejected, color: 'bg-destructive' },
                    ].map((stage) => (
                      <div key={stage.label} className="flex items-center gap-3">
                        <div className={`h-2 ${stage.color} rounded-full`} style={{ width: `${(stage.count / pipelineStats.total) * 100}%`, minWidth: stage.count > 0 ? '20px' : '0' }} />
                        <span className="text-sm text-muted-foreground flex-1">{stage.label}</span>
                        <span className="text-sm font-medium">{stage.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client Info */}
            {client && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-manager" strokeWidth={1.5} />
                    Client Information
                  </CardTitle>
                  <CardDescription>Hiring company details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Company</p>
                    <p className="text-lg font-semibold">{client.name}</p>
                  </div>
                  {client.industry && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Industry</p>
                      <p>{client.industry}</p>
                    </div>
                  )}
                  {client.website && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Website</p>
                      <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-manager hover:underline flex items-center gap-1">
                        {client.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {client.contact_name && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Contact</p>
                      <p className="font-medium">{client.contact_name}</p>
                      {client.contact_email && (
                        <a href={`mailto:${client.contact_email}`} className="text-sm text-muted-foreground hover:text-manager flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.contact_email}
                        </a>
                      )}
                      {client.contact_phone && (
                        <a href={`tel:${client.contact_phone}`} className="text-sm text-muted-foreground hover:text-manager flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {client.contact_phone}
                        </a>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Owner</p>
                    <p>{recruiterName}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Job Description */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Job Description</CardTitle>
              </CardHeader>
              <CardContent>
                {job.description ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap">{job.description}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No description provided</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Applications */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-manager" strokeWidth={1.5} />
                  Recent Applications
                </CardTitle>
                <CardDescription>Latest candidates who applied</CardDescription>
              </CardHeader>
              <CardContent>
                {applications.length === 0 ? (
                  <p className="text-muted-foreground">No applications yet</p>
                ) : (
                  <div className="space-y-2">
                    {applications.slice(0, 10).map((app) => (
                      <div key={app.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50">
                        <div>
                          <p className="font-medium">{app.profiles.full_name || app.profiles.email}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(app.applied_at)}</p>
                        </div>
                        <Badge variant="outline">{app.status}</Badge>
                      </div>
                    ))}
                    {applications.length > 10 && (
                      <Button asChild variant="outline" className="w-full">
                        <Link to={`/recruiter/pipeline?job=${job.id}`}>
                          View all {applications.length} applications
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
