import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type EngagementRow = {
  id: string;
  stage: string;
  updated_at: string;
  notes: string | null;
  candidate_profiles: {
    id: string;
    full_name: string | null;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    years_of_experience: number | null;
  } | null;
};

const STAGES = [
  { value: 'rate_confirmation', label: 'Rate confirmation' },
  { value: 'right_to_represent', label: 'Right to represent' },
  { value: 'screening', label: 'Screening' },
  { value: 'submission', label: 'Submission' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'closed', label: 'Closed' },
];

const NEXT_STAGE: Record<string, string> = {
  rate_confirmation: 'right_to_represent',
  right_to_represent: 'screening',
  screening: 'submission',
  submission: 'interview',
  interview: 'offer',
  offer: 'onboarding',
  onboarding: 'closed',
  closed: 'closed',
};

export default function EngagementPipeline() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = roles.find((r) => r.role === 'recruiter')?.organization_id;

  const [stageFilter, setStageFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-engagements', organizationId],
    queryFn: async (): Promise<EngagementRow[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('candidate_engagements')
        .select(
          `
          id, stage, updated_at, notes,
          candidate_profiles!inner(
            id, full_name, current_title, current_company, location, years_of_experience
          )
        `
        )
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!organizationId,
  });

  const rows = useMemo(() => {
    if (stageFilter === 'all') return data || [];
    return (data || []).filter((r) => r.stage === stageFilter);
  }, [data, stageFilter]);

  const advance = useMutation({
    mutationFn: async (engagementId: string) => {
      const row = (data || []).find((r) => r.id === engagementId);
      if (!row) throw new Error('Engagement not found');
      const next = NEXT_STAGE[row.stage] || 'closed';
      const { error } = await supabase
        .from('candidate_engagements')
        .update({ stage: next })
        .eq('id', engagementId);
      if (error) throw error;
      return next;
    },
    onSuccess: async (next) => {
      toast.success(`Moved to ${STAGES.find((s) => s.value === next)?.label || next}`);
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements', organizationId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to move stage'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={<>Engagement <span className="text-accent">Pipeline</span></>}
          description="Internal recruiter workflow for sourced/marketplace profiles once you start engagement."
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{rows.length} engagements</Badge>
          </div>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Engagements</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-[180px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                          No engagements yet. Start one from Marketplace Profiles.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="font-medium">{r.candidate_profiles?.full_name || 'Anonymous profile'}</div>
                              <div className="text-sm text-muted-foreground">
                                {[
                                  r.candidate_profiles?.current_title,
                                  r.candidate_profiles?.current_company,
                                  r.candidate_profiles?.location,
                                ]
                                  .filter(Boolean)
                                  .join(' • ') || '—'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {STAGES.find((s) => s.value === r.stage)?.label || r.stage}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(r.updated_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => advance.mutate(r.id)}
                              disabled={advance.isPending || r.stage === 'closed'}
                            >
                              <ArrowRight className="h-4 w-4 mr-2" />
                              Next stage
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

