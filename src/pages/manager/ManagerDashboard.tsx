import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Briefcase, Users, TrendingUp, Clock, Copy, Plus, Loader2, Key, Target, Award, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
  const { organizationId, currentRole, user, isLoading: authLoading } = useAuth();
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

      // For account managers, count only recruiters assigned to them.
      let recruitersCount = rolesData?.filter(r => r.role === 'recruiter').length || 0;
      if (currentRole === 'account_manager' && user?.id) {
        const { data: assigned } = await supabase
          .from('account_manager_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('organization_id', organizationId)
          .eq('account_manager_user_id', user.id);
        recruitersCount = assigned?.length || 0;
      }

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
              .select('user_id, full_name, email')
              .eq('id', app.candidate_id)
              .single();

            let candidateName = (candidateProfile?.full_name || '').trim();
            if (!candidateName && candidateProfile?.user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('user_id', candidateProfile.user_id)
                .single();
              candidateName = (profile?.full_name || '').trim();
            }
            if (!candidateName && (candidateProfile?.email || '').trim()) {
              candidateName = (candidateProfile.email || '').trim().split('@')[0] || '';
            }
            if (!candidateName) candidateName = 'Applicant';

            appsList.push({
              id: app.id,
              candidate_name: candidateName,
              job_title: (app.jobs as any)?.title || 'Job',
              status: app.status || 'applied',
              applied_at: app.applied_at
            });
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



  return (
    <DashboardLayout>
      <div className="space-y-8 animate-in-view">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">
              Manager <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-rose-500">Dashboard</span>
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Organization overview, team activity, and metrics.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild className="hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-200">
              <Link to="/manager/team">
                <Users className="mr-2 h-4 w-4" /> Manage Team
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Open Jobs"
            value={stats.openJobs.toString()}
            icon={Briefcase}
            iconColor="text-amber-500"
            change="Active Listings"
            changeType="neutral"
          />
          <StatCard
            title="Recruiters"
            value={stats.totalRecruiters.toString()}
            icon={Users}
            iconColor="text-orange-500"
            change="Team Size"
            changeType="neutral"
          />
          <StatCard
            title="Candidates"
            value={stats.totalCandidates.toString()}
            icon={Target}
            iconColor="text-rose-500"
            change="Total Pipeline"
            changeType="neutral"
          />
          <StatCard
            title="Applications"
            value={stats.totalApplications.toString()}
            icon={Clock}
            iconColor="text-red-500"
            change="Recent Activity"
            changeType="neutral"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Invite Codes & Team */}
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                Invite Codes
              </h2>
              <div className="glass-panel p-6 rounded-xl hover-card-premium">
                <div className="flex flex-row items-center justify-between pb-4 border-b border-white/5 mb-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-medium">
                      Active Invitations
                    </h3>
                    <p className="text-sm text-muted-foreground">Manage codes for candidate access.</p>
                  </div>
                  <Button onClick={createInviteCode} disabled={isCreatingCode} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white border-0">
                    {isCreatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Create</>}
                  </Button>
                </div>
                <div>
                  {inviteCodes.length === 0 ? (
                    <p className="text-sm p-4 text-center text-muted-foreground">No codes yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {inviteCodes.slice(0, 5).map((code) => (
                        <div key={code.id} className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between group">
                          <code className="font-mono text-lg font-bold text-amber-600 tracking-wider">{code.code}</code>
                          <div className="flex items-center gap-3">
                            <Badge variant={code.is_active ? "default" : "secondary"} className={code.is_active ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""}>
                              {code.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{code.uses_count} uses</div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={() => copyCode(code.code)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  One Team
                </h2>
                <Button variant="link" size="sm" asChild className="text-amber-600 hover:text-amber-500">
                  <Link to="/manager/team">View All <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
              <div className="glass-panel p-6 rounded-xl hover-card-premium">
                {teamMembers.length === 0 ? (
                  <p className="text-sm p-6 text-center text-muted-foreground">No team members found.</p>
                ) : (
                  <div className="space-y-3">
                    {teamMembers.slice(0, 5).map((member) => (
                      <div key={member.id} className="p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm border border-amber-500/20">
                            {member.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs border-white/10 bg-white/5">
                          {member.role === 'recruiter' ? 'Recruiter' :
                            member.role === 'account_manager' ? 'Manager' : member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Applications */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-red-500" />
                Latest Applications
              </h2>
            </div>

            <div className="glass-panel p-6 rounded-xl hover-card-premium h-full">
              {recentApplications.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-12">
                  <Clock className="h-12 w-12 mb-4 opacity-20" />
                  <p>No recent applications.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentApplications.map((app) => (
                    <div key={app.id} className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 font-bold group-hover:bg-rose-500 group-hover:text-white transition-colors">
                          <Award className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold group-hover:text-rose-500 transition-colors">{app.candidate_name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {app.job_title}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <Badge variant="outline" className={`mb-1 ${app.status === 'applied' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                          app.status === 'hired' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                            'border-white/10 bg-white/5'
                          }`}>
                          {app.status}
                        </Badge>
                        <div className="text-xs text-muted-foreground">{formatDate(app.applied_at)}</div>
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