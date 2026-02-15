import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Calendar, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, startOfDay } from 'date-fns';

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

      for (const member of teamMembers) {
        // For each role the user has, generate a summary
        for (const role of member.roles) {
          // Aggregate activity for this user/role/period
          const { error: aggError } = await supabase.rpc('aggregate_user_activity', {
            p_user_id: member.user_id,
            p_organization_id: organizationId,
            p_date: end, // Use end date for single-day periods
            p_acting_role: role,
          });

          if (aggError) {
            console.error(`Failed to aggregate for ${member.full_name} (${role}):`, aggError);
          }

          // Generate AI summary
          const { data, error: summaryError } = await supabase.functions.invoke('generate-activity-summary', {
            body: {
              userId: member.user_id,
              organizationId: organizationId,
              activityDate: end,
              actingRole: role,
            },
          });

          if (!summaryError && data?.success) {
            newSummaries.push({
              user_id: member.user_id,
              user_name: member.full_name,
              role: role,
              summary: data.summary || 'No activity recorded for this period.',
              period: timePeriod,
              generated_at: new Date().toISOString(),
            });
          } else {
            // Add placeholder for failed summary
            newSummaries.push({
              user_id: member.user_id,
              user_name: member.full_name,
              role: role,
              summary: 'No activity recorded for this period.',
              period: timePeriod,
              generated_at: null,
            });
          }
        }
      }

      setSummaries(newSummaries);
      toast.success('Summaries generated');
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
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">You need manager or admin permissions to view team activity.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
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
  );
}
