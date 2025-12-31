import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users, Sparkles, Clock, PlusCircle, ArrowRight, Key, Copy, Plus, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DashboardAnalytics } from '@/components/recruiter/DashboardAnalytics';

interface RecruiterStats {
  openJobs: number;
  totalApplications: number;
  totalCandidates: number;
}

interface InviteCode {
  id: string;
  code: string;
  uses_count: number;
  is_active: boolean;
}

interface RecentApplication {
  id: string;
  candidate_name: string;
  job_title: string;
  applied_at: string;
}

export default function RecruiterDashboard() {
  const { roles, organizationId } = useAuth();
  const [stats, setStats] = useState<RecruiterStats>({ openJobs: 0, totalApplications: 0, totalCandidates: 0 });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCode, setIsCreatingCode] = useState(false);

  const orgId = organizationId || roles.find(r => r.role === 'recruiter')?.organization_id;

  useEffect(() => {
    if (orgId) {
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }
  }, [orgId]);

  const fetchDashboardData = async () => {
    if (!orgId) return;
    
    try {
      // Fetch jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('organization_id', orgId);
      
      const openJobs = jobs?.filter(j => j.status === 'published').length || 0;
      const jobIds = jobs?.map(j => j.id) || [];

      // Fetch applications for org's jobs
      let totalApplications = 0;
      const appsList: RecentApplication[] = [];
      
      if (jobIds.length > 0) {
        const { data: applications } = await supabase
          .from('applications')
          .select(`
            id, applied_at, candidate_id,
            jobs!inner(title)
          `)
          .in('job_id', jobIds)
          .order('applied_at', { ascending: false })
          .limit(5);
        
        totalApplications = applications?.length || 0;
        
        if (applications) {
          for (const app of applications) {
            const { data: candidateProfile } = await supabase
              .from('candidate_profiles')
              .select('user_id')
              .eq('id', app.candidate_id)
              .single();
            
            if (candidateProfile) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('user_id', candidateProfile.user_id)
                .single();
              
              appsList.push({
                id: app.id,
                candidate_name: profile?.full_name || 'Unknown',
                job_title: (app.jobs as any)?.title || 'Unknown',
                applied_at: app.applied_at
              });
            }
          }
        }
      }

      setRecentApplications(appsList);

      // Fetch candidates in org
      const { data: candidates } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('organization_id', orgId);

      // Fetch invite codes
      const { data: codes } = await supabase
        .from('organization_invite_codes')
        .select('id, code, uses_count, is_active')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (codes) {
        setInviteCodes(codes);
      }

      setStats({
        openJobs,
        totalApplications,
        totalCandidates: candidates?.length || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createInviteCode = async () => {
    if (!orgId) return;
    
    setIsCreatingCode(true);
    try {
      const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');
      
      if (codeError) throw codeError;
      
      const { data, error } = await supabase
        .from('organization_invite_codes')
        .insert({
          organization_id: orgId,
          code: codeData,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setInviteCodes([{ id: data.id, code: data.code, uses_count: 0, is_active: true }, ...inviteCodes.slice(0, 2)]);
      toast.success('Invite code created!');
    } catch (error) {
      console.error('Error creating invite code:', error);
      toast.error('Failed to create invite code');
    } finally {
      setIsCreatingCode(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Recruiter Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your jobs and candidates</p>
          </div>
          <Button asChild>
            <Link to="/recruiter/jobs/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Post a Job
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Open Jobs" value={stats.openJobs.toString()} icon={Briefcase} href="/recruiter/jobs" />
          <StatCard title="Total Applications" value={stats.totalApplications.toString()} icon={Users} href="/recruiter/candidates" />
          <StatCard title="Candidates in Org" value={stats.totalCandidates.toString()} icon={Users} href="/recruiter/talent-pool" />
        </div>

        {/* Analytics Charts */}
        <DashboardAnalytics />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Invite Codes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Invite Candidates
                </CardTitle>
                <CardDescription>Share codes to invite candidates to your organization</CardDescription>
              </div>
              <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm">
                {isCreatingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" /> New
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              {inviteCodes.length === 0 ? (
                <p className="text-muted-foreground text-sm">Create an invite code to start inviting candidates.</p>
              ) : (
                <div className="space-y-2">
                  {inviteCodes.map((code) => (
                    <div key={code.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <code className="font-mono font-bold">{code.code}</code>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{code.uses_count} uses</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyCode(code.code)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Matching */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Candidate Matching
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Let AI find the best candidates for your open positions automatically.
              </p>
              <Button asChild>
                <Link to="/recruiter/ai-matching">
                  Find Matches <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Applications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Applications</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruiter/candidates">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentApplications.length === 0 ? (
              <p className="text-muted-foreground text-sm">No applications yet. Post a job to start receiving applications.</p>
            ) : (
              <div className="space-y-3">
                {recentApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{app.candidate_name}</p>
                      <p className="text-sm text-muted-foreground">Applied for: {app.job_title}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDate(app.applied_at)}</span>
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