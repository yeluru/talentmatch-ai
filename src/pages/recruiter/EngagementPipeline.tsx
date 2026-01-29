import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, GripVertical, Mail, Send, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { can } from '@/lib/permissions';
import { useSearchParams } from 'react-router-dom';

type EngagementRow = {
  id: string;
  stage: string;
  updated_at: string;
  notes: string | null;
  job_id?: string | null;
  candidate_profiles: {
    id: string;
    full_name: string | null;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    years_of_experience: number | null;
    email?: string | null;
  } | null;
  jobs?: { id: string; title: string } | null;
};

const PIPELINE_STAGES = [
  { id: 'started', label: 'Started', dot: 'bg-slate-500', border: 'border-slate-400/60' },
  { id: 'outreach', label: 'Outreach', dot: 'bg-blue-500', border: 'border-blue-500/40' },
  { id: 'rate_confirmation', label: 'Rate', dot: 'bg-indigo-500', border: 'border-indigo-500/40' },
  { id: 'right_to_represent', label: 'RTR', dot: 'bg-purple-500', border: 'border-purple-500/40' },
  { id: 'screening', label: 'Screening', dot: 'bg-yellow-500', border: 'border-yellow-500/40' },
  { id: 'submission', label: 'Submission', dot: 'bg-teal-500', border: 'border-teal-500/40' },
  { id: 'interview', label: 'Interview', dot: 'bg-orange-500', border: 'border-orange-500/40' },
  { id: 'offer', label: 'Offer', dot: 'bg-green-500', border: 'border-green-500/40' },
  { id: 'onboarding', label: 'Onboarding', dot: 'bg-emerald-600', border: 'border-emerald-600/40' },
  { id: 'closed', label: 'Closed', dot: 'bg-red-500', border: 'border-red-500/40' },
] as const;

const STAGE_EMAIL_CONFIG: Record<
  string,
  {
    requestType: string;
    templateCategory: string;
    defaultSubject: (ctx: { candidateName: string; jobTitle: string; companyName: string }) => string;
    defaultBody: (ctx: { candidateName: string; jobTitle: string; companyName: string; recruiterName: string }) => string;
  }
> = {
  outreach: {
    requestType: 'outreach',
    templateCategory: 'outreach',
    defaultSubject: ({ jobTitle, companyName }) => `Quick chat about ${jobTitle} at ${companyName}?`,
    defaultBody: ({ candidateName, jobTitle, companyName, recruiterName }) =>
      `Hi ${candidateName},\n\nI’m ${recruiterName} from ${companyName}. We’re preparing a submission for a ${jobTitle} opportunity and wanted to confirm your interest.\n\nIf you’re open to it, please review and respond using the link below.\n`,
  },
  rate_confirmation: {
    requestType: 'rate_confirmation',
    templateCategory: 'offer',
    defaultSubject: ({ jobTitle, companyName }) => `Rate confirmation for ${jobTitle} (${companyName})`,
    defaultBody: ({ candidateName, jobTitle, companyName, recruiterName }) =>
      `Hi ${candidateName},\n\nTo proceed with your submission for ${jobTitle} at ${companyName}, please confirm your expected rate/compensation (or counter) using the link below.\n\nThanks,\n${recruiterName}\n`,
  },
  right_to_represent: {
    requestType: 'rtr',
    templateCategory: 'general',
    defaultSubject: ({ jobTitle, companyName }) => `Right to Represent (RTR) for ${jobTitle} at ${companyName}`,
    defaultBody: ({ candidateName, jobTitle, companyName, recruiterName }) =>
      `Hi ${candidateName},\n\nBefore we submit you for ${jobTitle} at ${companyName}, we need your Right to Represent (RTR) confirmation.\n\nPlease review and accept using the link below.\n\nThanks,\n${recruiterName}\n`,
  },
  offer: {
    requestType: 'offer',
    templateCategory: 'offer',
    defaultSubject: ({ jobTitle, companyName }) => `Offer update for ${jobTitle} (${companyName})`,
    defaultBody: ({ candidateName, jobTitle, companyName, recruiterName }) =>
      `Hi ${candidateName},\n\nWe have an update regarding the offer process for ${jobTitle} at ${companyName}. Please review and respond using the link below.\n\nThanks,\n${recruiterName}\n`,
  },
};

export default function EngagementPipeline() {
  const { roles, profile, currentRole, user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const organizationId =
    roles.find((r) => r.role === 'recruiter')?.organization_id ||
    roles.find((r) => r.role === 'account_manager')?.organization_id ||
    roles.find((r) => r.role === 'org_admin')?.organization_id ||
    null;
  const ownerParam = searchParams.get('owner');
  const effectiveOwnerUserId =
    currentRole === 'recruiter'
      ? (user?.id || null)
      : ownerParam && (currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin')
        ? ownerParam
        : null;
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveEngagement, setMoveEngagement] = useState<EngagementRow | null>(null);
  const [moveToStage, setMoveToStage] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('none');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [skipEmailOverride, setSkipEmailOverride] = useState(false);

  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.from('jobs').select('id, title').eq('organization_id', organizationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: org } = useQuery({
    queryKey: ['org-details', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase.from('organizations').select('id, name').eq('id', organizationId).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!organizationId,
  });

  const { data: templates } = useQuery({
    queryKey: ['email-templates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject, body, category')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!organizationId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-engagements', organizationId, selectedJob, effectiveOwnerUserId],
    queryFn: async (): Promise<EngagementRow[]> => {
      if (!organizationId) return [];
      let q = supabase
        .from('candidate_engagements')
        .select(
          `
          id, stage, updated_at, notes, job_id,
          candidate_profiles(
            id, full_name, current_title, current_company, location, years_of_experience, email
          ),
          jobs:job_id(id, title)
        `
        )
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false });

      if (selectedJob !== 'all') {
        q = q.eq('job_id', selectedJob);
      }

      if (effectiveOwnerUserId) {
        q = q.eq('owner_user_id', effectiveOwnerUserId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!organizationId,
  });

  const appsByStage = useMemo(() => {
    const map = new Map<string, EngagementRow[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const row of (data || [])) {
      const k = String(row.stage || 'started');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return map;
  }, [data]);

  const updateStageOnly = useMutation({
    mutationFn: async ({ engagementId, stage }: { engagementId: string; stage: string }) => {
      const { error } = await supabase.from('candidate_engagements').update({ stage } as any).eq('id', engagementId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to move stage'),
  });

  const createAndSendRequest = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('Missing organization');
      if (!moveEngagement) throw new Error('Missing engagement');
      if (!moveToStage) throw new Error('Missing stage');
      const cfg = STAGE_EMAIL_CONFIG[moveToStage];
      if (!cfg) throw new Error('No email workflow for this stage');

      const toEmail = (moveEngagement.candidate_profiles as any)?.email || null;
      if (!toEmail) throw new Error('Candidate email missing');

      // Create request row
      const { data: reqRow, error: insErr } = await supabase
        .from('candidate_engagement_requests')
        .insert({
          engagement_id: moveEngagement.id,
          request_type: cfg.requestType,
          status: 'queued',
          to_email: toEmail,
          subject: draftSubject,
          body: draftBody,
          payload: { move_to_stage: moveToStage, job_id: moveEngagement.job_id || null },
          created_by: (profile as any)?.user_id || (profile as any)?.id || null,
        } as any)
        .select('id')
        .single();
      if (insErr) throw insErr;

      const requestId = (reqRow as any)?.id as string;
      if (!requestId) throw new Error('Failed to create request');

      // Send via edge function (Mailpit in dev)
      const { error: fnErr } = await supabase.functions.invoke('send-engagement-email', {
        body: { requestId, appUrl: window.location.origin },
      });
      if (fnErr) throw fnErr;

      // Advance stage after send (or just update if override)
      await supabase
        .from('candidate_engagements')
        .update({ stage: moveToStage } as any)
        .eq('id', moveEngagement.id);
    },
    onSuccess: async () => {
      toast.success('Email sent and stage updated');
      setMoveOpen(false);
      setMoveEngagement(null);
      setMoveToStage('');
      setTemplateId('none');
      setDraftSubject('');
      setDraftBody('');
      setSkipEmailOverride(false);
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagement-requests'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send email'),
  });

  const selectedJobTitle =
    selectedJob === 'all'
      ? 'All Jobs'
      : (jobs || []).find((j: any) => String(j.id) === String(selectedJob))?.title || 'Selected Job';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={<>Engagement <span className="text-accent">Pipeline</span></>}
          description="Engage internal candidates for submission: outreach → rate → RTR → screening → submission → offer → onboarding."
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm">
              Showing: <span className="text-foreground">{selectedJobTitle}</span> ·{' '}
              <span className="text-foreground">{(data || []).length}</span> engagement{(data || []).length === 1 ? '' : 's'}
            </div>
          </div>
          <Select value={selectedJob} onValueChange={(v) => setSelectedJob(String(v))}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filter by job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {(jobs || []).map((j: any) => (
                <SelectItem key={j.id} value={String(j.id)} className="max-w-[320px]">
                  <span className="block max-w-[300px] truncate">{j.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="grid gap-3 pb-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {PIPELINE_STAGES.map((stage) => (
                <div
                  key={stage.id}
                  className="min-w-0"
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverStage !== stage.id) setDragOverStage(stage.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedId) return;
                    const row = (data || []).find((r) => r.id === draggedId) || null;
                    setDraggedId(null);
                    setDragOverStage(null);
                    if (!row) return;

                    // If this stage has a workflow email, open the composer modal; else just update stage.
                    if (STAGE_EMAIL_CONFIG[stage.id]) {
                      const candidateName = row.candidate_profiles?.full_name || 'there';
                      const jobTitle = row.jobs?.title || 'the role';
                      const companyName = (org as any)?.name || 'our team';
                      const recruiterName = (profile as any)?.full_name || 'Recruiting team';
                      const cfg = STAGE_EMAIL_CONFIG[stage.id];

                      setMoveEngagement(row);
                      setMoveToStage(stage.id);
                      setTemplateId('none');
                      setDraftSubject(cfg.defaultSubject({ candidateName, jobTitle, companyName }));
                      setDraftBody(cfg.defaultBody({ candidateName, jobTitle, companyName, recruiterName }));
                      setMoveOpen(true);
                      return;
                    }

                    updateStageOnly.mutate({ engagementId: row.id, stage: stage.id });
                    toast.success(`Moved to ${stage.label}`);
                  }}
                  onDragLeave={() => {
                    if (dragOverStage === stage.id) setDragOverStage(null);
                  }}
                >
                  <Card className={`h-full overflow-hidden rounded-2xl border bg-card/70 shadow-sm ${dragOverStage === stage.id ? 'ring-2 ring-primary/20 border-primary/30' : ''}`}>
                    <CardHeader className={`py-3 px-4 bg-background/70 backdrop-blur-sm border-b ${stage.border}`}>
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-2.5 w-2.5 rounded-full ${stage.dot} shrink-0`} />
                            <CardTitle className="text-sm font-semibold truncate">{stage.label}</CardTitle>
                          </div>
                          {STAGE_EMAIL_CONFIG[stage.id] ? (
                            <div className="text-xsmt-1 flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5" />
                              Move triggers email
                            </div>
                          ) : null}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {(appsByStage.get(stage.id)?.length || 0)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 bg-muted/10">
                      <div className="space-y-2 min-h-[160px]">
                        {(appsByStage.get(stage.id)?.length || 0) === 0 ? (
                          <div className={`rounded-xl border border-dashed p-6 ${dragOverStage === stage.id ? 'bg-primary/5 border-primary/30 text-foreground' : 'bg-background/50 border-muted-foreground/15'}`}>
                            <div className="flex flex-col items-center gap-2 text-center">
                              <Users className="h-4 w-4 opacity-70" />
                              <div className="text-sm font-medium">No engagements</div>
                              <div className="text-xs">Drag a card here to move it.</div>
                            </div>
                          </div>
                        ) : (
                          (appsByStage.get(stage.id) || []).map((r, idx) => (
                            <div
                              key={r.id}
                              draggable
                              onDragStart={() => setDraggedId(r.id)}
                              onDragEnd={() => {
                                setDraggedId(null);
                                setDragOverStage(null);
                              }}
                              className={`group p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-colors ${
                                idx % 2 === 1
                                  ? 'bg-secondary/40 hover:bg-secondary/60 hover:border-primary/20'
                                  : 'bg-background hover:bg-muted/50 hover:border-primary/20'
                              } ${draggedId === r.id ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="mt-0.5 shrink-0group-hover:text-foreground/80">
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-sm truncate">{r.candidate_profiles?.full_name || 'Candidate'}</div>
                                      <div className="text-xstruncate">
                                        {[
                                          r.candidate_profiles?.current_title,
                                          r.candidate_profiles?.current_company,
                                          r.candidate_profiles?.location,
                                        ]
                                          .filter(Boolean)
                                          .join(' • ') || '—'}
                                      </div>
                                    </div>
                                  </div>
                                  {r.jobs?.title ? (
                                    <div className="mt-2 text-xstruncate">{r.jobs.title}</div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send email to move stage</DialogTitle>
          </DialogHeader>

          {!moveEngagement ? (
            <div className="text-sm">Select an engagement to move.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-sm font-medium">
                  {moveEngagement.candidate_profiles?.full_name || 'Candidate'} ·{' '}
                  <span className="">{moveEngagement.jobs?.title || 'No job'}</span>
                </div>
                <div className="text-xsmt-1">
                  Moving to: <span className="text-foreground">{PIPELINE_STAGES.find((s) => s.id === moveToStage)?.label || moveToStage}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email template</Label>
                  <Select
                    value={templateId}
                    onValueChange={(v) => {
                      setTemplateId(v);
                      if (v === 'none') return;
                      const t = (templates || []).find((x: any) => String(x.id) === String(v));
                      if (!t) return;
                      // Best-effort variable substitution
                      const candidateName = moveEngagement.candidate_profiles?.full_name || 'there';
                      const jobTitle = moveEngagement.jobs?.title || 'the role';
                      const companyName = (org as any)?.name || 'our team';
                      const recruiterName = (profile as any)?.full_name || 'Recruiting team';

                      const replaceVars = (s: string) =>
                        String(s || '')
                          .replaceAll('{{candidate_name}}', candidateName)
                          .replaceAll('{{job_title}}', jobTitle)
                          .replaceAll('{{company_name}}', companyName)
                          .replaceAll('{{recruiter_name}}', recruiterName);

                      setDraftSubject(replaceVars(t.subject || ''));
                      setDraftBody(replaceVars(t.body || ''));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template (use draft)</SelectItem>
                      {(templates || [])
                        .filter((t: any) => {
                          const cfg = STAGE_EMAIL_CONFIG[moveToStage];
                          if (!cfg) return true;
                          return String(t.category || 'general') === String(cfg.templateCategory);
                        })
                        .map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>To</Label>
                  <Input value={String((moveEngagement.candidate_profiles as any)?.email || '')} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="min-h-[200px]" />
                <div className="text-xs">
                  The email will include a secure “Review & respond” link. Candidates will be prompted to login/signup.
                </div>
              </div>

              {can(currentRole, 'engagement.override') ? (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-sm font-medium">Account manager override</div>
                  <div className="text-xsmt-1">
                    Use only if you must move stages without sending an email (this will be audited later).
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="skip-email-override"
                      type="checkbox"
                      checked={skipEmailOverride}
                      onChange={(e) => setSkipEmailOverride(e.target.checked)}
                    />
                    <Label htmlFor="skip-email-override">Skip email and force move</Label>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={createAndSendRequest.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => createAndSendRequest.mutate()} disabled={createAndSendRequest.isPending || !draftSubject.trim() || !draftBody.trim()}>
                  {createAndSendRequest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send & move
                </Button>
                {can(currentRole, 'engagement.override') && skipEmailOverride ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!moveEngagement || !moveToStage) return;
                      updateStageOnly.mutate({ engagementId: moveEngagement.id, stage: moveToStage });
                      toast.success('Stage overridden');
                      setMoveOpen(false);
                      setSkipEmailOverride(false);
                    }}
                  >
                    Force move
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

