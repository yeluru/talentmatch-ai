import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, supabaseUrl } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { OrgAdminLayout } from '@/components/layouts/OrgAdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Calendar, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';

interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  roles: string[];
}

interface ActivitySummary {
  user_id: string;
  user_name: string;
  role: string;
  summary: string | null;
  period: string;
  generated_at: string | null;
}

export default function TeamActivity() {
  const { user, currentRole, organizationId } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [summaries, setSummaries] = useState<ActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [timePeriod, setTimePeriod] = useState<string>('today');

  const isManager = currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin';
  const Layout = currentRole === 'org_admin' ? OrgAdminLayout : DashboardLayout;

  useEffect(() => {
    if (isManager && organizationId) {
      fetchTeamMembers();
    } else {
      // No org ID or not a manager - stop loading
      setLoading(false);
    }
  }, [isManager, organizationId]);

  useEffect(() => {
    if (teamMembers.length > 0) {
      generateSummaries();
    }
  }, [timePeriod, teamMembers]);

  const fetchTeamMembers = async () => {
    setLoading(true);
    try {
      // Get all users in the organization with their roles
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', organizationId!)
        .in('role', ['recruiter', 'account_manager', 'org_admin']);

      if (error) throw error;

      // Group by user and aggregate roles
      const userMap = new Map<string, string[]>();
      userRoles?.forEach(ur => {
        if (!userMap.has(ur.user_id)) {
          userMap.set(ur.user_id, []);
        }
        userMap.get(ur.user_id)!.push(ur.role);
      });

      // Fetch profiles for these users
      const userIds = Array.from(userMap.keys());
      if (userIds.length === 0) {
        setTeamMembers([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const members: TeamMember[] = profiles?.map(p => ({
        user_id: p.user_id,
        full_name: p.full_name || p.email,
        email: p.email,
        roles: userMap.get(p.user_id) || []
      })) || [];

      setTeamMembers(members);
    } catch (error: any) {
      console.error('Error fetching team members:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const today = startOfDay(new Date());
    switch (timePeriod) {
      case 'today':
        return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { start: format(yesterday, 'yyyy-MM-dd'), end: format(yesterday, 'yyyy-MM-dd') };
      case 'week':
        return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      case 'month':
        return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      default:
        return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
    }
  };

  const generateSummaries = async () => {
    if (!organizationId || teamMembers.length === 0) return;

    setGenerating(true);
    const newSummaries: ActivitySummary[] = [];

    try {
      const { start, end } = getDateRange();
      console.log(`Generating summaries for ${getPeriodLabel()} (${start} to ${end})`);
      console.log(`Processing ${teamMembers.length} team members`);

      // First, check if there are ANY audit logs at all
      const { data: totalLogs, error: totalError } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', start + 'T00:00:00')
        .lte('created_at', end + 'T23:59:59');

      console.log(`Total audit logs in period:`, totalLogs);

      for (const member of teamMembers) {
        // Query ALL audit logs for this user (regardless of role)
        const { data: auditLogs, error: logsError } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('user_id', member.user_id)
          .eq('organization_id', organizationId)
          .gte('created_at', start + 'T00:00:00')
          .lte('created_at', end + 'T23:59:59');

        if (logsError) {
          console.error(`Failed to query audit logs for ${member.full_name}:`, logsError);
        }

        console.log(`Audit logs for ${member.full_name}:`, auditLogs?.length || 0, 'actions');

        // Group actions by acting_role
        const actionsByRole = new Map<string, typeof auditLogs>();
        auditLogs?.forEach(log => {
          const role = log.acting_role || 'recruiter';
          if (!actionsByRole.has(role)) {
            actionsByRole.set(role, []);
          }
          actionsByRole.get(role)!.push(log);
        });

        // Generate a summary for each role they acted as
        for (const [role, actions] of actionsByRole.entries()) {
          // Log unique action types to see what we're working with
          const uniqueActions = [...new Set(actions.map(a => `${a.action}:${a.entity_type}`))];
          console.log(`${member.full_name} (${role}) - ${actions.length} actions:`, uniqueActions);

          // Call the LLM edge function to generate summary from audit logs
          try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;

            const response = await fetch(`${supabaseUrl}/functions/v1/generate-activity-summary`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                userId: member.user_id,
                userName: member.full_name,
                organizationId: organizationId,
                startDate: start,
                endDate: end,
                actingRole: role,
                auditLogs: actions, // Pass the audit logs directly
              }),
            });

            const result = await response.json();

            if (result.success && result.summary) {
              newSummaries.push({
                user_id: member.user_id,
                user_name: member.full_name,
                role: role,
                summary: result.summary,
                period: timePeriod,
                generated_at: new Date().toISOString(),
              });
            } else {
              console.error(`Failed to generate summary for ${member.full_name}:`, result.error);
              // Fallback to simple summary
              newSummaries.push({
                user_id: member.user_id,
                user_name: member.full_name,
                role: role,
                summary: actions.length > 0
                  ? `${member.full_name} had ${actions.length} action${actions.length > 1 ? 's' : ''} during this period.`
                  : 'No activity recorded for this period.',
                period: timePeriod,
                generated_at: new Date().toISOString(),
              });
            }
          } catch (error) {
            console.error(`Error calling LLM for ${member.full_name}:`, error);
            // Fallback to simple summary
            newSummaries.push({
              user_id: member.user_id,
              user_name: member.full_name,
              role: role,
              summary: actions.length > 0
                ? `${member.full_name} had ${actions.length} action${actions.length > 1 ? 's' : ''} during this period.`
                : 'No activity recorded for this period.',
              period: timePeriod,
              generated_at: new Date().toISOString(),
            });
          }
        }

        // If no activity at all for this user, add a "no activity" entry
        if (actionsByRole.size === 0) {
          newSummaries.push({
            user_id: member.user_id,
            user_name: member.full_name,
            role: member.roles[0] || 'unknown',
            summary: 'No activity recorded for this period.',
            period: timePeriod,
            generated_at: new Date().toISOString(),
          });
        }
      }

      setSummaries(newSummaries);
      if (newSummaries.length > 0) {
        toast.success('Summaries generated');
      } else {
        toast.info('No activity found for this period');
      }
    } catch (error: any) {
      console.error('Error generating summaries:', error);
      toast.error('Failed to generate summaries');
    } finally {
      setGenerating(false);
    }
  };

  const getPeriodLabel = () => {
    switch (timePeriod) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      default: return 'Today';
    }
  };

  if (!isManager) {
    return (
      <Layout>
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">You need manager or admin permissions to view team activity.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!organizationId) {
    return (
      <Layout>
        <div className="p-6 space-y-6 font-sans max-w-6xl">
          <div>
            <h1 className="text-3xl font-bold">Team Activity Summaries</h1>
            <p className="text-muted-foreground mt-1">
              AI-generated activity summaries for your team
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Organization Required</p>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Team Activity is only available when your {currentRole === 'super_admin' ? 'platform admin' : 'account'} is linked to an organization.
                  {currentRole === 'super_admin' && ' Platform admins can view team activity for organizations they belong to.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 font-sans max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Activity Summaries</h1>
          <p className="text-muted-foreground mt-1">
            AI-generated activity summaries for your team
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={generateSummaries} variant="outline" size="sm" disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCcw className="w-4 h-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : generating ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <div className="relative inline-block mb-6">
                <Sparkles className="w-20 h-20 mx-auto text-primary animate-pulse" />
                <Loader2 className="w-20 h-20 absolute inset-0 text-primary/40 animate-spin" />
              </div>
              <p className="text-xl font-semibold mb-2">Generating activity summaries with AI...</p>
              <p className="text-muted-foreground mt-2 text-base">
                Analyzing audit logs and creating detailed insights for {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>This may take a few moments...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : summaries.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No team activity summaries</p>
              <p className="text-muted-foreground mt-2">
                {teamMembers.length === 0
                  ? 'No team members found in your organization.'
                  : 'Click Refresh to generate activity summaries for your team.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4" />
            <span>Showing summaries for {getPeriodLabel().toLowerCase()}</span>
          </div>

          {summaries.map((summary, idx) => (
            <Card key={`${summary.user_id}-${summary.role}-${idx}`} className="border-l-4 border-l-primary">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{summary.user_name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-normal">
                        {summary.role.replace('_', ' ')}
                      </Badge>
                      {summary.generated_at && (
                        <span className="text-xs text-muted-foreground">
                          Updated {format(new Date(summary.generated_at), 'h:mm a')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {summary.summary}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </Layout>
  );
}
