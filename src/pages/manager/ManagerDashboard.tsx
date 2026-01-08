import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users, TrendingUp, Clock, Copy, Plus, Loader2, Key } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';

interface OrgStats {
  openJobs: number;
  totalRecruiters: number;
  totalCandidates: number;
  totalApplications: number;
}

interface InviteCode {
  id: string;
  code: string;
  uses_count: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface RecentApplication {
  id: string;
  candidate_name: string;
  job_title: string;
  status: string;
  applied_at: string;
}

export default function ManagerDashboard() {
  const { organizationId, currentRole, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<OrgStats>({ openJobs: 0, totalRecruiters: 0, totalCandidates: 0, totalApplications: 0 });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCode, setIsCreatingCode] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading before deciding on data fetch
    if (authLoading) return;
    
    if (organizationId) {
      fetchOrgData();
    } else {
      // No org ID available after auth loaded - stop loading state
      setIsLoading(false);
    }
  }, [organizationId, authLoading]);

  const fetchOrgData = async () => {
    if (!organizationId) return;
    
    try {
      // Fetch jobs count
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('organization_id', organizationId);
      
      const openJobs = jobs?.filter(j => j.status === 'published').length || 0;

      // Fetch team members (recruiters in same org)
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', organizationId);

      const recruitersCount = rolesData?.filter(r => r.role === 'recruiter').length || 0;
      
      // Fetch team member profiles
      if (rolesData && rolesData.length > 0) {
        const userIds = rolesData.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, user_id')
          .in('user_id', userIds);
        
        if (profiles) {
          const members = profiles.map(p => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: rolesData.find(r => r.user_id === p.user_id)?.role || 'unknown'
          }));
          setTeamMembers(members);
        }
      }

      // Fetch candidates in org
      const { data: candidates } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('organization_id', organizationId);

      // Fetch applications for org's jobs
      const jobIds = jobs?.map(j => j.id) || [];
      let applicationsCount = 0;
      const appsList: RecentApplication[] = [];
      
      if (jobIds.length > 0) {
        const { data: applications } = await supabase
          .from('applications')
          .select(`
            id, status, applied_at, 
            candidate_id,
            jobs!inner(title)
          `)
          .in('job_id', jobIds)
          .order('applied_at', { ascending: false })
          .limit(5);
        
        applicationsCount = applications?.length || 0;
        
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
                status: app.status || 'applied',
                applied_at: app.applied_at
              });
            }
          }
        }
      }

      setRecentApplications(appsList);

      // Fetch invite codes
      const { data: codes } = await supabase
        .from('organization_invite_codes')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (codes) {
        setInviteCodes(codes as InviteCode[]);
      }

      setStats({
        openJobs,
        totalRecruiters: recruitersCount,
        totalCandidates: candidates?.length || 0,
        totalApplications: applicationsCount
      });
    } catch (error) {
      console.error('Error fetching org data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createInviteCode = async () => {
    if (!organizationId) return;
    
    setIsCreatingCode(true);
    try {
      // Generate random code
      const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');
      
      if (codeError) throw codeError;
      
      const { data, error } = await supabase
        .from('organization_invite_codes')
        .insert({
          organization_id: organizationId,
          code: codeData,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setInviteCodes([data as InviteCode, ...inviteCodes]);
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
        <PageHeader
          title={
            <>
              Account Manager <span className="text-accent">Dashboard</span>
            </>
          }
          description="Organization overview, team activity, and the latest pipeline signals."
          actions={
            <Button variant="outline" asChild>
              <Link to="/manager/team">View team</Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Open Jobs" value={stats.openJobs.toString()} icon={Briefcase} href="/manager/jobs" />
          <StatCard title="Recruiters" value={stats.totalRecruiters.toString()} icon={Users} href="/manager/team" />
          <StatCard title="Candidates" value={stats.totalCandidates.toString()} icon={Users} href="/manager/candidates" />
          <StatCard title="Applications" value={stats.totalApplications.toString()} icon={Clock} href="/manager/analytics" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Invite Codes Section */}
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Invite Codes
                </CardTitle>
                <CardDescription>Share codes with candidates to join your organization</CardDescription>
              </div>
              <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm">
                {isCreatingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" /> New Code
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              {inviteCodes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No invite codes yet. Create one to invite candidates.</p>
              ) : (
                <div className="space-y-3">
                  {inviteCodes.slice(0, 5).map((code) => (
                    <div key={code.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <code className="font-mono text-lg font-bold">{code.code}</code>
                        <Badge variant={code.is_active ? "default" : "secondary"}>
                          {code.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {code.uses_count} uses
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => copyCode(code.code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Recruiters and managers in your organization</CardDescription>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No team members found.</p>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant="outline">
                        {member.role === 'recruiter' ? 'Recruiter' : 
                         member.role === 'account_manager' ? 'Manager' : member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Applications */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>Latest candidate applications across all jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentApplications.length === 0 ? (
              <p className="text-muted-foreground text-sm">No applications yet.</p>
            ) : (
              <div className="space-y-3">
                {recentApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{app.candidate_name}</p>
                      <p className="text-sm text-muted-foreground">Applied for: {app.job_title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{app.status}</Badge>
                      <span className="text-sm text-muted-foreground">{formatDate(app.applied_at)}</span>
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