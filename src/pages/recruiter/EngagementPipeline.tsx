import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { applicationStageColumnKey } from '@/lib/statusOptions';

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

// Unified pipeline stages (same as applications.status); legacy names mapped in appsByStage via applicationStageColumnKey
const PIPELINE_STAGES = [
  { id: 'outreach', label: 'Outreach', dot: 'bg-slate-500', border: 'border-slate-400/60' },
  { id: 'rate_confirmation', label: 'Rate', dot: 'bg-blue-500', border: 'border-blue-500/40' },
  { id: 'right_to_represent', label: 'RTR', dot: 'bg-indigo-500', border: 'border-indigo-500/40' },
  { id: 'applied', label: 'Applied', dot: 'bg-blue-400', border: 'border-blue-400/40' },
  { id: 'reviewing', label: 'Reviewing', dot: 'bg-sky-500', border: 'border-sky-500/40' },
  { id: 'screening', label: 'Screening', dot: 'bg-yellow-500', border: 'border-yellow-500/40' },
  { id: 'shortlisted', label: 'Shortlisted', dot: 'bg-teal-500', border: 'border-teal-500/40' },
  { id: 'interviewing', label: 'Interviewing', dot: 'bg-orange-500', border: 'border-orange-500/40' },
  { id: 'offered', label: 'Offered', dot: 'bg-green-500', border: 'border-green-500/40' },
  { id: 'hired', label: 'Hired', dot: 'bg-emerald-600', border: 'border-emerald-600/40' },
  { id: 'rejected', label: 'Rejected', dot: 'bg-red-500', border: 'border-red-500/40' },
  { id: 'withdrawn', label: 'Withdrawn', dot: 'bg-gray-500', border: 'border-gray-500/40' },
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
  offered: {
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
    queryKey: ['recruiter-jobs', organizationId, effectiveOwnerUserId, user?.id],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase.from('jobs').select('id, title, recruiter_id, visibility').eq('organization_id', organizationId);
      if (effectiveOwnerUserId) {
        if (effectiveOwnerUserId === user?.id) {
          q = q.or(`recruiter_id.eq.${effectiveOwnerUserId},visibility.eq.public`);
        } else {
          q = q.eq('recruiter_id', effectiveOwnerUserId);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: ownerProfile } = useQuery({
    queryKey: ['owner-profile', effectiveOwnerUserId],
    queryFn: async () => {
      if (!effectiveOwnerUserId) return null;
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', effectiveOwnerUserId).maybeSingle();
      return data as { full_name: string | null } | null;
    },
    enabled: !!effectiveOwnerUserId && (currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin'),
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

  const jobIdsForEngagements = (jobs ?? []).map((j: { id: string }) => j.id);
  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-engagements', organizationId, selectedJob, effectiveOwnerUserId, user?.id, jobIdsForEngagements.join(',')],
    queryFn: async (): Promise<EngagementRow[]> => {
      if (!organizationId) return [];
      const jobIds = jobIdsForEngagements;
      let q = supabase
        .from('candidate_engagements' as any)
        .select(
          `
          id, stage, updated_at, notes, job_id, owner_user_id,
          candidate_profiles(
            id, full_name, current_title, current_company, location, years_of_experience, email
          ),
          jobs:job_id(id, title, recruiter_id, visibility)
        `
        )
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false });

      if (selectedJob !== 'all') {
        q = q.eq('job_id', selectedJob);
      }

      if (effectiveOwnerUserId && jobIds.length > 0) {
        if (effectiveOwnerUserId === user?.id) {
          q = q.in('job_id', jobIds);
        } else {
          const ownerJobIds = (jobs ?? []).filter((j: any) => j.recruiter_id === effectiveOwnerUserId).map((j: { id: string }) => j.id);
          if (ownerJobIds.length === 0) return [];
          q = q.in('job_id', ownerJobIds);
        }
      }

      const { data: rows, error } = await q;
      if (error) throw error;
      let list = (rows || []) as any[];

      if (effectiveOwnerUserId && list.length > 0) {
        list = list.filter((row: any) => row.owner_user_id === effectiveOwnerUserId);
      }

      return list;
    },
    enabled: !!organizationId && (effectiveOwnerUserId ? (jobs != null) : true),
  });

  const appsByStage = useMemo(() => {
    const map = new Map<string, EngagementRow[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const row of (data || [])) {
      const k = applicationStageColumnKey(row.stage) ?? String(row.stage || 'outreach');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return map;
  }, [data]);

  const updateStageOnly = useMutation({
    mutationFn: async ({
      engagementId,
      stage,
      jobId,
      candidateId,
    }: {
      engagementId: string;
      stage: string;
      jobId?: string | null;
      candidateId?: string | null;
    }) => {
      const { error } = await supabase.from('candidate_engagements' as any).update({ stage } as any).eq('id', engagementId);
      if (error) throw error;
      if (jobId && candidateId) {
        const { error: appErr } = await supabase
          .from('applications')
          .update({ status: stage })
          .eq('job_id', jobId)
          .eq('candidate_id', candidateId);
        if (appErr) throw appErr;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
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
        .from('candidate_engagement_requests' as any)
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
        .from('candidate_engagements' as any)
        .update({ stage: moveToStage } as any)
        .eq('id', moveEngagement.id);
      if (moveEngagement.job_id && (moveEngagement.candidate_profiles as any)?.id) {
        await supabase
          .from('applications')
          .update({ status: moveToStage })
          .eq('job_id', moveEngagement.job_id)
          .eq('candidate_id', (moveEngagement.candidate_profiles as any).id);
      }
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
      await queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send email'),
  });

  const selectedJobTitle =
    selectedJob === 'all'
      ? 'All Jobs'
      : (jobs || []).find((j: any) => String(j.id) === String(selectedJob))?.title || 'Selected Job';

  const isViewingAsManager = (currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin') && !!effectiveOwnerUserId;

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 px-4 sm:px-6">
        {isViewingAsManager && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3 shrink-0 mt-4">
            <Users className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={1.5} />
            <p className="text-sm font-sans font-medium text-amber-800 dark:text-amber-200">
              Viewing <span className="font-semibold">{ownerProfile?.full_name || 'this recruiter'}</span>&apos;s pipeline.
            </p>
          </div>
        )}
        {/* Header - clearly separated from pipeline */}
        <div className="shrink-0 py-6 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20 shrink-0">
                  <Mail className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground">
                  Engagement <span className="text-gradient-recruiter">Pipeline</span>
                </h1>
              </div>
              <p className="text-base sm:text-lg text-muted-foreground font-sans mt-1">
                Engage internal candidates: outreach → rate → RTR → screening → submission → offer → onboarding.
              </p>
            </div>
            <Select value={selectedJob} onValueChange={(v) => setSelectedJob(String(v))}>
              <SelectTrigger className="w-full md:w-56 lg:w-64 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans shrink-0">
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
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center flex-1 min-h-0 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-recruiter" strokeWidth={1.5} />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 w-full">
            {/* Kanban columns - responsive; column headers have min height and wrapping so titles are not squeezed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-6 min-w-0">
              {PIPELINE_STAGES.map((stage) => (
                <div
                  key={stage.id}
                  className="flex flex-col h-full min-w-0"
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

                    updateStageOnly.mutate({
                      engagementId: row.id,
                      stage: stage.id,
                      jobId: row.job_id ?? undefined,
                      candidateId: (row.candidate_profiles as any)?.id ?? undefined,
                    });
                    toast.success(`Moved to ${stage.label}`);
                  }}
                  onDragLeave={() => {
                    if (dragOverStage === stage.id) setDragOverStage(null);
                  }}
                >
                  {/* Column Header - enough space for title and count; title can wrap */}
                  <div className={`mb-3 flex items-start justify-between gap-2 p-3 min-h-[72px] rounded-xl border font-sans ${dragOverStage === stage.id ? 'ring-2 ring-recruiter/50 bg-recruiter/10 border-recruiter/30' : 'bg-card border-border'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`h-3 w-3 rounded-full shrink-0 ${stage.dot} shadow-[0_0_10px_currentColor]`} />
                        <span className="font-display font-bold text-sm tracking-tight text-foreground break-words">{stage.label}</span>
                      </div>
                      {STAGE_EMAIL_CONFIG[stage.id] ? (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 pl-5">
                          <Mail className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                          Auto-email
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="secondary" className="bg-muted text-foreground font-mono font-sans text-xs shrink-0 border-border ml-1">
                      {(appsByStage.get(stage.id)?.length || 0)}
                    </Badge>
                  </div>

                  {/* Drop Zone / List */}
                  <div className={`h-[320px] overflow-y-auto rounded-xl p-1.5 space-y-2 border transition-colors duration-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] ${dragOverStage === stage.id
                    ? 'bg-recruiter/5 border-recruiter/20'
                    : 'bg-muted/30 dark:bg-muted/20 border-border'
                    }`}>
                    {(appsByStage.get(stage.id)?.length || 0) === 0 ? (
                      <div className="h-full max-h-32 flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed border-border rounded-xl m-2 opacity-50">
                        <p className="text-xs font-sans font-medium">Empty</p>
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
                          className={`
                            group relative p-3 rounded-xl border border-border
                            bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5
                            transition-all duration-200 cursor-grab active:cursor-grabbing
                            border-l-[3px] border-l-recruiter hover:border-recruiter/50 hover:bg-recruiter/5
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2
                            ${draggedId === r.id ? 'opacity-40 rotate-2 scale-95 ring-2 ring-recruiter/50' : ''}
                          `}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9 border border-recruiter/20 shrink-0">
                              <AvatarFallback className="bg-recruiter/10 text-recruiter text-[10px] font-sans font-bold">
                                {(r.candidate_profiles?.full_name || 'C').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-display font-bold text-sm truncate text-foreground leading-tight group-hover:text-recruiter transition-colors">
                                  {r.candidate_profiles?.full_name || 'Candidate'}
                                </span>
                                <div className="p-1 rounded-lg hover:bg-recruiter/10 transition-colors cursor-grab text-muted-foreground hover:text-recruiter">
                                  <GripVertical className="h-4 w-4" strokeWidth={1.5} />
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground font-sans uppercase tracking-wider mt-0.5 truncate">
                                {[
                                  r.candidate_profiles?.current_title,
                                  r.candidate_profiles?.current_company,
                                ]
                                  .filter(Boolean)
                                  .join(' • ') || '—'}
                              </div>
                              {r.jobs?.title && (
                                <div className="mt-2 text-[10px] font-sans font-medium truncate bg-recruiter/10 text-recruiter px-2 py-1 rounded-lg border border-recruiter/20 inline-block max-w-full">
                                  {r.jobs.title}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Hover Glow Effect */}
                          <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent group-hover:ring-recruiter/10 pointer-events-none transition-all" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-2xl max-w-full rounded-xl border border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">Send email to move stage</DialogTitle>
          </DialogHeader>

          {!moveEngagement ? (
            <div className="text-sm font-sans text-muted-foreground">Select an engagement to move.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-recruiter/20 bg-recruiter/5 p-4">
                <div className="text-sm font-sans font-medium flex items-center gap-2">
                  <span className="text-recruiter font-display font-bold">{moveEngagement.candidate_profiles?.full_name || 'Candidate'}</span>
                  <span className="text-muted-foreground">in relation to</span>
                  <span className="font-medium text-foreground">{moveEngagement.jobs?.title || 'No job'}</span>
                </div>
                <div className="text-xs mt-2 flex items-center gap-2 font-sans">
                  <span className="text-muted-foreground">Moving to:</span>
                  <Badge className={`${PIPELINE_STAGES.find((s) => s.id === moveToStage)?.dot.replace('bg-', 'bg-') || 'bg-recruiter'} text-white border-0`}>
                    {PIPELINE_STAGES.find((s) => s.id === moveToStage)?.label || moveToStage}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-sans">Email template</Label>
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
                          .replace(/{{candidate_name}}/g, candidateName)
                          .replace(/{{job_title}}/g, jobTitle)
                          .replace(/{{company_name}}/g, companyName)
                          .replace(/{{recruiter_name}}/g, recruiterName);

                      setDraftSubject(replaceVars(t.subject || ''));
                      setDraftBody(replaceVars(t.body || ''));
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans">
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
                  <Label className="text-sm font-sans">To</Label>
                  <Input value={String((moveEngagement.candidate_profiles as any)?.email || '')} readOnly className="h-11 rounded-lg border-border bg-muted/50 font-sans" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-sans">Subject</Label>
                <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-sans">Message</Label>
                <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="min-h-[200px] rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans resize-none" />
                <div className="text-xs text-muted-foreground font-sans flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-recruiter" />
                  The email will include a secure “Review & respond” link. Candidates will be prompted to login/signup.
                </div>
              </div>

              {can(currentRole, 'engagement.override') ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <div className="text-sm font-medium text-red-500">Account manager override</div>
                  <div className="text-xs mt-1 text-muted-foreground">
                    Use only if you must move stages without sending an email (this will be audited later).
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="skip-email-override"
                      type="checkbox"
                      checked={skipEmailOverride}
                      onChange={(e) => setSkipEmailOverride(e.target.checked)}
                      className="accent-red-500"
                    />
                    <Label htmlFor="skip-email-override" className="cursor-pointer">Skip email and force move</Label>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={createAndSendRequest.isPending} className="rounded-lg h-11 border-border hover:bg-muted font-sans">
                  Cancel
                </Button>
                <Button onClick={() => createAndSendRequest.mutate()} disabled={createAndSendRequest.isPending || !draftSubject.trim() || !draftBody.trim()} className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold">
                  {createAndSendRequest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4 mr-2" strokeWidth={1.5} />}
                  Send & move
                </Button>
                {can(currentRole, 'engagement.override') && skipEmailOverride ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!moveEngagement || !moveToStage) return;
                      updateStageOnly.mutate({
                        engagementId: moveEngagement.id,
                        stage: moveToStage,
                        jobId: moveEngagement.job_id ?? undefined,
                        candidateId: (moveEngagement.candidate_profiles as any)?.id ?? undefined,
                      });
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

