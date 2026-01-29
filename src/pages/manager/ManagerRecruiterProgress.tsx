import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ArrowUpRight, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

type EngagementRow = {
  id: string;
  stage: string;
  updated_at: string;
  owner_user_id: string | null;
  candidate_profiles: { full_name: string | null } | null;
  jobs: { title: string } | null;
};

const STAGES = [
  'started',
  'outreach',
  'rate_confirmation',
  'right_to_represent',
  'screening',
  'submission',
  'interview',
  'offer',
  'onboarding',
  'closed',
];

export default function ManagerRecruiterProgress() {
  const { recruiterUserId } = useParams();
  const { organizationId, user } = useAuth();

  const { data: assignmentOk, isLoading: loadingAssign } = useQuery({
    queryKey: ['am-assignment-check', organizationId, user?.id, recruiterUserId],
    queryFn: async () => {
      if (!organizationId || !user?.id || !recruiterUserId) return false;
      const { data } = await supabase
        .from('account_manager_recruiter_assignments')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_manager_user_id', user.id)
        .eq('recruiter_user_id', recruiterUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!organizationId && !!user?.id && !!recruiterUserId,
  });

  const { data: recruiterProfile } = useQuery({
    queryKey: ['recruiter-profile', recruiterUserId],
    queryFn: async () => {
      if (!recruiterUserId) return null;
      const { data } = await supabase.from('profiles').select('full_name, email').eq('user_id', recruiterUserId).maybeSingle();
      return data as any;
    },
    enabled: !!recruiterUserId && !!assignmentOk,
  });

  const { data: engagements, isLoading } = useQuery({
    queryKey: ['recruiter-engagements-by-owner', organizationId, recruiterUserId],
    queryFn: async (): Promise<EngagementRow[]> => {
      if (!organizationId || !recruiterUserId) return [];
      const { data, error } = await supabase
        .from('candidate_engagements')
        .select(
          `
          id, stage, updated_at, owner_user_id,
          candidate_profiles:candidate_id(full_name),
          jobs:job_id(title)
        `
        )
        .eq('organization_id', organizationId)
        .eq('owner_user_id', recruiterUserId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!organizationId && !!recruiterUserId && !!assignmentOk,
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    STAGES.forEach((s) => (map[s] = 0));
    (engagements || []).forEach((e) => {
      const k = String(e.stage || 'started');
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [engagements]);

  if (loadingAssign) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!assignmentOk) {
    return (
      <DashboardLayout>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Not assigned</CardTitle>
            <CardDescription>This recruiter is not assigned to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/manager/team">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Team
              </Link>
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/manager/team">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Team
                </Link>
              </Button>
              <h1 className="font-display text-2xl font-bold truncate">
                {recruiterProfile?.full_name || 'Recruiter'} · Progress
              </h1>
            </div>
            <div className="text-smmt-1">
              {recruiterProfile?.email || ''}
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link to={`/recruiter/engagements?owner=${encodeURIComponent(String(recruiterUserId || ""))}`}>
              Open Engagement Pipeline
              <ArrowUpRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map((s) => (
            <Card key={s} className="card-elevated">
              <CardHeader className="py-3">
                <CardTitle className="text-sm capitalize">{s.replaceAll('_', ' ')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold">{counts[s] || 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent engagements
            </CardTitle>
            <CardDescription>Latest 200 engagements owned by this recruiter.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {(engagements || []).length === 0 ? (
                  <div className="text-sm">No engagements yet.</div>
                ) : (
                  (engagements || []).map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border p-3 bg-card">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.candidate_profiles?.full_name || 'Candidate'}</div>
                        <div className="text-xstruncate">
                          {e.jobs?.title ? e.jobs.title : 'No job'} · Updated {new Date(e.updated_at).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {String(e.stage || 'started').replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

