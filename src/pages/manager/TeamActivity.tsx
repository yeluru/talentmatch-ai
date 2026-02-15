import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
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

  useEffect(() => {
    if (isManager && organizationId) {
      fetchTeamMembers();
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
          const uniqueActions = [...new Set(actions.map(a => a.action))];
          console.log(`${member.full_name} (${role}) - ${actions.length} actions:`, uniqueActions);

          // Calculate activity from audit logs for this role
          const candidatesImported = actions.filter(a =>
            a.action === 'bulk_import_candidates' || a.action === 'import_candidate'
          ).length;

          const candidatesUploaded = actions.filter(a =>
            a.action === 'upload_resume' || a.action === 'create_candidate'
          ).length;

          const candidatesMoved = actions.filter(a =>
            a.action === 'update_application_status' || a.action === 'move_candidate'
          ).length;

          const jobsCreated = actions.filter(a => a.action === 'create_job').length;

          const rtrSent = actions.filter(a => a.action?.toLowerCase().includes('rtr')).length;

          const notesAdded = actions.filter(a => a.action === 'update_candidate_notes').length;

          // Calculate active time (rough estimate)
          let activeMinutes = 0;
          if (actions.length > 0) {
            const timestamps = actions.map(a => new Date(a.created_at).getTime()).sort();
            const firstAction = timestamps[0];
            const lastAction = timestamps[timestamps.length - 1];
            activeMinutes = Math.min(960, Math.round((lastAction - firstAction) / 60000)); // Cap at 16 hours
          }

          // Generate summary
          let summary = '';
          if (actions.length === 0) {
            summary = 'No activity recorded for this period.';
          } else {
            const hours = Math.round(activeMinutes / 60 * 10) / 10;
            const parts = [];

            if (hours > 0) {
              parts.push(`${member.full_name} was active for approximately ${hours} hour${hours !== 1 ? 's' : ''} during this period`);
            } else {
              parts.push(`${member.full_name} had ${actions.length} action${actions.length > 1 ? 's' : ''} during this period`);
            }

            if (candidatesImported > 0) {
              parts.push(`imported ${candidatesImported} candidate${candidatesImported > 1 ? 's' : ''}`);
            }

            if (candidatesUploaded > 0) {
              parts.push(`uploaded ${candidatesUploaded} candidate${candidatesUploaded > 1 ? 's' : ''}`);
            }

            if (candidatesMoved > 0) {
              parts.push(`moved ${candidatesMoved} candidate${candidatesMoved > 1 ? 's' : ''} through the pipeline`);
            }

            if (rtrSent > 0) {
              parts.push(`sent ${rtrSent} RTR document${rtrSent > 1 ? 's' : ''}`);
            }

            if (jobsCreated > 0) {
              parts.push(`created ${jobsCreated} job${jobsCreated > 1 ? 's' : ''}`);
            }

            if (notesAdded > 0) {
              parts.push(`added ${notesAdded} note${notesAdded > 1 ? 's' : ''}`);
            }

            if (parts.length === 1) {
              summary = parts[0] + '.';
            } else {
              const lastPart = parts.pop();
              summary = parts.join(', ') + ', and ' + lastPart + '.';
            }
          }

          newSummaries.push({
            user_id: member.user_id,
            user_name: member.full_name,
            role: role,
            summary: summary,
            period: timePeriod,
            generated_at: new Date().toISOString(),
          });
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
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">You need manager or admin permissions to view team activity.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
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
      ) : generating && summaries.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto text-primary mb-4 animate-pulse" />
              <p className="text-lg font-medium">Generating activity summaries...</p>
              <p className="text-muted-foreground mt-2">
                This may take a moment for larger teams
              </p>
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
                Summaries will appear here once generated
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
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {summary.summary}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
