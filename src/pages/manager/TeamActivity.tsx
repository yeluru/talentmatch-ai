import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Users, Clock, FileText, UserPlus, ArrowRight, Briefcase, Mail, RefreshCcw, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, startOfDay } from 'date-fns';

interface DailyActivity {
  id: string;
  user_id: string;
  organization_id: string;
  activity_date: string;
  acting_role: string;
  login_count: number;
  total_active_minutes: number;
  candidates_imported: number;
  candidates_uploaded: number;
  candidates_moved: number;
  moved_to_screening: number;
  moved_to_interview: number;
  moved_to_offer: number;
  moved_to_hired: number;
  moved_to_rejected: number;
  notes_added: number;
  jobs_created: number;
  jobs_worked_on: string[] | null;
  rtr_documents_sent: number;
  applications_created: number;
  applications_updated: number;
  ai_summary: string | null;
  summary_generated_at: string | null;
  profiles: {
    full_name: string;
  };
}

export default function TeamActivity() {
  const { user, currentRole, organizationId } = useAuth();
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>('today');
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [aggregating, setAggregating] = useState(false);
  const hasAttemptedAggregation = useRef(false);

  const isManager = currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin';

  useEffect(() => {
    if (isManager && organizationId) {
      fetchTeamActivity();
    }
  }, [isManager, organizationId, dateRange]);

  const getDateRangeFilter = () => {
    const today = startOfDay(new Date());

    switch (dateRange) {
      case 'today':
        return format(today, 'yyyy-MM-dd');
      case 'yesterday':
        return format(subDays(today, 1), 'yyyy-MM-dd');
      case 'last7':
        return format(subDays(today, 7), 'yyyy-MM-dd');
      case 'last30':
        return format(subDays(today, 30), 'yyyy-MM-dd');
      default:
        return format(today, 'yyyy-MM-dd');
    }
  };

  const fetchTeamActivity = async () => {
    setLoading(true);
    try {
      const startDate = getDateRangeFilter();

      let query = supabase
        .from('daily_user_activity')
        .select(`
          *,
          profiles!daily_user_activity_user_id_fkey(full_name)
        `)
        .eq('organization_id', organizationId!)
        .order('activity_date', { ascending: false })
        .order('total_active_minutes', { ascending: false });

      // Apply date filter
      if (dateRange === 'today' || dateRange === 'yesterday') {
        query = query.eq('activity_date', startDate);
      } else {
        query = query.gte('activity_date', startDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      setActivities(data || []);
    } catch (error: any) {
      console.error('Error fetching team activity:', error);
      toast.error('Failed to load team activity');
    } finally {
      setLoading(false);
    }
  };

  const aggregateActivity = async (userId: string, date: string, role: string) => {
    try {
      const { data, error } = await supabase.rpc('aggregate_user_activity', {
        p_user_id: userId,
        p_organization_id: organizationId!,
        p_date: date,
        p_acting_role: role || null,
      });

      if (error) throw error;

      await fetchTeamActivity();
      toast.success('Activity data refreshed');
    } catch (error: any) {
      console.error('Error aggregating activity:', error);
      toast.error('Failed to refresh activity data');
    }
  };

  const aggregateAllTeamActivity = async () => {
    if (!organizationId || aggregating) return;

    setAggregating(true);
    try {
      // Get all users in the organization
      const { data: orgUsers, error: usersError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', organizationId)
        .in('role', ['recruiter', 'account_manager']);

      if (usersError) throw usersError;

      if (!orgUsers || orgUsers.length === 0) {
        toast.info('No team members found');
        return;
      }

      const today = format(new Date(), 'yyyy-MM-dd');

      // Aggregate for each user sequentially to avoid overloading
      for (const u of orgUsers) {
        const { error } = await supabase.rpc('aggregate_user_activity', {
          p_user_id: u.user_id,
          p_organization_id: organizationId,
          p_date: today,
          p_acting_role: u.role,
        });

        if (error) {
          console.error(`Failed to aggregate for user ${u.user_id}:`, error);
        }
      }

      await fetchTeamActivity();
      toast.success(`Aggregated activity for ${orgUsers.length} team members`);
    } catch (error: any) {
      console.error('Error aggregating team activity:', error);
      toast.error('Failed to aggregate team activity');
    } finally {
      setAggregating(false);
    }
  };

  const generateSummary = async (activity: DailyActivity) => {
    setGeneratingSummary(activity.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-activity-summary', {
        body: {
          userId: activity.user_id,
          organizationId: activity.organization_id,
          activityDate: activity.activity_date,
          actingRole: activity.acting_role,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('AI summary generated');
        await fetchTeamActivity();
      } else {
        throw new Error(data?.error || 'Failed to generate summary');
      }
    } catch (error: any) {
      console.error('Error generating summary:', error);
      toast.error('Failed to generate AI summary');
    } finally {
      setGeneratingSummary(null);
    }
  };

  const formatActiveTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getActivityColor = (minutes: number) => {
    if (minutes >= 360) return 'text-green-600'; // 6+ hours
    if (minutes >= 240) return 'text-yellow-600'; // 4+ hours
    return 'text-gray-600';
  };

  const toggleExpanded = (activityId: string) => {
    setExpandedActivity(expandedActivity === activityId ? null : activityId);
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
    <div className="p-6 space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Activity</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your team's productivity and performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={aggregateAllTeamActivity}
            variant="outline"
            size="sm"
            disabled={aggregating}
          >
            {aggregating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Aggregating...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Aggregate Activity
              </>
            )}
          </Button>

          <Button onClick={fetchTeamActivity} variant="outline" size="sm">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No activity data available</p>
              <p className="text-muted-foreground mt-2">
                Activity will appear here once team members start using the platform
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <Card key={activity.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                      {activity.profiles?.full_name || 'Unknown User'}
                      <Badge variant="outline" className="font-normal">
                        {activity.acting_role || 'recruiter'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {format(new Date(activity.activity_date), 'EEEE, MMMM d, yyyy')}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => aggregateActivity(activity.user_id, activity.activity_date, activity.acting_role)}
                      variant="ghost"
                      size="sm"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => toggleExpanded(activity.id)}
                      variant="ghost"
                      size="sm"
                    >
                      {expandedActivity === activity.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Active Time</p>
                      <p className={`text-lg font-semibold ${getActivityColor(activity.total_active_minutes)}`}>
                        {formatActiveTime(activity.total_active_minutes)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <UserPlus className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Imported</p>
                      <p className="text-lg font-semibold">{activity.candidates_imported}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <ArrowRight className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Moved</p>
                      <p className="text-lg font-semibold">{activity.candidates_moved}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Mail className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">RTR Sent</p>
                      <p className="text-lg font-semibold">{activity.rtr_documents_sent}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedActivity === activity.id && (
                  <div className="pt-4 border-t space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Uploaded</p>
                        <p className="font-medium">{activity.candidates_uploaded}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Notes Added</p>
                        <p className="font-medium">{activity.notes_added}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Jobs Created</p>
                        <p className="font-medium">{activity.jobs_created}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Jobs Worked On</p>
                        <p className="font-medium">{activity.jobs_worked_on?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applications Created</p>
                        <p className="font-medium">{activity.applications_created}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applications Updated</p>
                        <p className="font-medium">{activity.applications_updated}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2">Pipeline Activity</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <span className="text-muted-foreground">Screening:</span>
                          <span className="font-medium">{activity.moved_to_screening}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                          <span className="text-muted-foreground">Interview:</span>
                          <span className="font-medium">{activity.moved_to_interview}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                          <span className="text-muted-foreground">Offer:</span>
                          <span className="font-medium">{activity.moved_to_offer}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="text-muted-foreground">Hired:</span>
                          <span className="font-medium">{activity.moved_to_hired}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                          <span className="text-muted-foreground">Rejected:</span>
                          <span className="font-medium">{activity.moved_to_rejected}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Summary Section */}
                {activity.ai_summary ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-blue-900 mb-1">AI Summary</p>
                        <p className="text-sm text-blue-800">{activity.ai_summary}</p>
                        {activity.summary_generated_at && (
                          <p className="text-xs text-blue-600 mt-2">
                            Generated {format(new Date(activity.summary_generated_at), 'PPp')}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => generateSummary(activity)}
                        variant="ghost"
                        size="sm"
                        disabled={generatingSummary === activity.id}
                      >
                        {generatingSummary === activity.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <p className="text-sm text-muted-foreground">
                        No AI summary generated yet
                      </p>
                    </div>
                    <Button
                      onClick={() => generateSummary(activity)}
                      variant="outline"
                      size="sm"
                      disabled={generatingSummary === activity.id}
                    >
                      {generatingSummary === activity.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Generate Summary
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
