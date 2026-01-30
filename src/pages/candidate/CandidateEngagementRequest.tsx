import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type RequestRow = {
  id: string;
  request_type: string;
  status: string;
  subject: string | null;
  body: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  payload: any;
  candidate_engagements: {
    id: string;
    stage: string;
    job_id: string | null;
    organizations?: { id: string; name: string } | null;
    jobs?: { id: string; title: string } | null;
  } | null;
};

function labelForType(t: string) {
  switch (t) {
    case 'outreach':
      return 'Outreach confirmation';
    case 'rate_confirmation':
      return 'Rate confirmation';
    case 'rtr':
      return 'Right to Represent (RTR)';
    case 'offer':
      return 'Offer review';
    default:
      return t || 'Request';
  }
}

function nextStageForResponse(requestType: string, response: 'accepted' | 'rejected' | 'countered') {
  if (response === 'rejected') return 'closed';
  if (response === 'countered') return null;

  // accepted
  switch (requestType) {
    case 'outreach':
      return 'rate_confirmation';
    case 'rate_confirmation':
      return 'right_to_represent';
    case 'rtr':
      return 'screening';
    case 'offer':
      return 'onboarding';
    default:
      return null;
  }
}

export default function CandidateEngagementRequest() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [counterMessage, setCounterMessage] = useState('');

  // Best-effort: claim a sourced candidate_profile by email so RLS allows access to requests
  useEffect(() => {
    (async () => {
      try {
        await (supabase.rpc as any)('claim_candidate_profile_by_email');
      } catch {
        // ignore
      }
    })();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['candidate-engagement-request', requestId],
    queryFn: async (): Promise<RequestRow | null> => {
      const id = String(requestId || '').trim();
      if (!id) return null;
      const { data, error } = await supabase
        .from('candidate_engagement_requests' as any)
        .select(
          `
          id, request_type, status, subject, body, created_at, sent_at, responded_at, payload,
          candidate_engagements:engagement_id (
            id, stage, job_id,
            organizations:organization_id ( id, name ),
            jobs:job_id ( id, title )
          )
        `
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as any;
    },
    enabled: !!requestId,
  });

  const canRespond = useMemo(() => {
    const st = String(data?.status || '');
    return st === 'sent' || st === 'viewed' || st === 'queued' || st === 'draft';
  }, [data?.status]);

  const respond = useMutation({
    mutationFn: async (resp: 'accepted' | 'rejected' | 'countered') => {
      if (!data) throw new Error('Request not loaded');
      const engagementId = data.candidate_engagements?.id;
      if (!engagementId) throw new Error('Engagement missing');

      const payload = {
        ...(data.payload || {}),
        response: resp,
        counter_message: resp === 'countered' ? String(counterMessage || '').trim().slice(0, 5000) : null,
      };

      const { error: updErr } = await supabase
        .from('candidate_engagement_requests' as any)
        .update({
          status: resp,
          responded_at: new Date().toISOString(),
          payload,
        } as any)
        .eq('id', data.id);
      if (updErr) throw updErr;

      const next = nextStageForResponse(String(data.request_type || ''), resp);
      if (next) {
        await supabase.from('candidate_engagements' as any).update({ stage: next, last_activity_at: new Date().toISOString() } as any).eq('id', engagementId);
      } else {
        await supabase.from('candidate_engagements' as any).update({ last_activity_at: new Date().toISOString() } as any).eq('id', engagementId);
      }
    },
    onSuccess: async () => {
      toast.success('Response submitted');
      await queryClient.invalidateQueries({ queryKey: ['candidate-engagement-request', requestId] });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to submit response'),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Request not available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              This request could not be loaded. If you just created an account, try refreshing.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const orgName = data.candidate_engagements?.organizations?.name || 'Company';
  const jobTitle = data.candidate_engagements?.jobs?.title || 'Job';

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="glass-panel p-8 border-l-4 border-l-accent animate-in-view">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">Action Required</h1>
                <div className="text-base text-muted-foreground mt-2">
                  {labelForType(String(data.request_type || ''))} for <span className="font-semibold text-foreground">{jobTitle}</span> at <span className="font-semibold text-foreground">{orgName}</span>
                </div>
              </div>
              <Badge variant={data.status === 'sent' || data.status === 'queued' ? 'default' : 'secondary'} className="text-sm px-3 py-1 uppercase tracking-wider">
                {String(data.status || '').toUpperCase()}
              </Badge>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-4">
              {data.subject && (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Subject</div>
                  <div className="text-lg font-medium">{data.subject}</div>
                </div>
              )}

              <div className="space-y-2 bg-muted/30 p-4 rounded-xl border border-white/5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Message from Recruiter</div>
                <div className="whitespace-pre-wrap text-base leading-relaxed">{data.body || '—'}</div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {!canRespond ? (
              <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/20 p-4 flex items-center gap-3 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">You’ve already responded to this request.</span>
              </div>
            ) : (
              <div className="space-y-6 pt-2">
                {(data.request_type === 'rate_confirmation' || data.request_type === 'offer') ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2 text-foreground">
                      <MessageSquare className="h-4 w-4 text-accent" />
                      Optional counter / message
                    </div>
                    <Textarea
                      value={counterMessage}
                      onChange={(e) => setCounterMessage(e.target.value)}
                      placeholder="Add details (e.g., rate expectation, availability, questions)…"
                      className="min-h-[120px] bg-background/50 border-white/10 resize-none focus:ring-accent"
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/candidate')}
                    disabled={respond.isPending}
                    className="hover:bg-white/5"
                  >
                    Decide Later
                  </Button>

                  {(data.request_type === 'rate_confirmation' || data.request_type === 'offer') ? (
                    <Button
                      variant="secondary"
                      onClick={() => respond.mutate('countered')}
                      disabled={respond.isPending || !String(counterMessage || '').trim()}
                      className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20"
                    >
                      {respond.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Counter Offer
                    </Button>
                  ) : null}

                  <Button
                    variant="destructive"
                    onClick={() => respond.mutate('rejected')}
                    disabled={respond.isPending}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-none"
                  >
                    {respond.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                    Reject
                  </Button>

                  <Button
                    onClick={() => respond.mutate('accepted')}
                    disabled={respond.isPending}
                    className="btn-primary-glow px-8"
                  >
                    {respond.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Accept Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

