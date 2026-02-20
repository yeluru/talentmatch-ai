import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { invokeFunction } from '@/lib/invokeFunction';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Loader2, GripVertical, Users, Send, Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { applicationStageColumnKey, FINAL_OUTCOME_OPTIONS, getFinalOutcomeLabel } from '@/lib/statusOptions';
import { RTR_RECRUITER_FIELDS, getDefaultRtrFieldValue } from '@/lib/rtrFields';
import { ApplicantDetailSheet } from '@/components/recruiter/ApplicantDetailSheet';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';

const COMMENTS_PREVIEW_LEN = 50;

interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  outcome?: string | null;
  applied_at: string;
  ai_match_score: number | null;
  candidate_profiles: {
    id: string;
    full_name: string | null;
    current_title: string | null;
    email: string | null;
    recruiter_notes?: string | null;
  } | null;
  jobs: {
    id: string;
    title: string;
  } | null;
}

// Consulting pipeline stage gates. First stage merges Engaged + Applied (recruiter-sourced and direct applicants).
const APPLIED_ENGAGED_STAGE_ID = 'applied_engaged';
/** Recruiter pipeline: ends at Submission; then Outcome (final_update) where recruiter records manager feedback. */
const PIPELINE_STAGES = [
  { id: APPLIED_ENGAGED_STAGE_ID, label: 'Applied / Engaged', dot: 'bg-slate-500', border: 'border-slate-400/60', headerBg: 'bg-slate-200 dark:bg-slate-800' },
  { id: 'rtr_rate', label: 'RTR & rate', dot: 'bg-indigo-500', border: 'border-indigo-500/40', headerBg: 'bg-indigo-100 dark:bg-indigo-950' },
  { id: 'document_check', label: 'Doc check', dot: 'bg-sky-500', border: 'border-sky-500/40', headerBg: 'bg-sky-100 dark:bg-sky-950' },
  { id: 'screening', label: 'Screening', dot: 'bg-amber-500', border: 'border-amber-500/40', headerBg: 'bg-amber-100 dark:bg-amber-950' },
  { id: 'submission', label: 'Submission', dot: 'bg-purple-500', border: 'border-purple-500/40', headerBg: 'bg-purple-100 dark:bg-purple-950' },
  { id: 'final_update', label: 'Outcome', dot: 'bg-teal-600', border: 'border-teal-500/40', headerBg: 'bg-teal-100 dark:bg-teal-950' },
] as const;

const DEFAULT_DOC_CHECK_SUBJECT = (jobTitle: string) =>
  `Please send your verification documents – ${jobTitle}`;
const DEFAULT_DOC_CHECK_BODY = (candidateName: string, jobTitle: string, recruiterName: string) =>
  `Hi ${candidateName || 'there'},

To move forward with your application for ${jobTitle}, we need the following verification documents:

• Copy of government-issued ID (e.g. driver's license)
• Visa status copy (if applicable)
• I-94 (if applicable)

Please reply to this email with the documents attached.

Thanks,
${recruiterName || 'Recruiting team'}`;

const DEFAULT_RTR_SUBJECT = (jobTitle: string) =>
  `Right to Represent (RTR) – ${jobTitle}`;
const DEFAULT_RTR_BODY = (candidateName: string, jobTitle: string, recruiterName: string) =>
  `Hi ${candidateName || 'there'},

We're excited to represent you for the ${jobTitle} position!

Please review and electronically sign the Right to Represent (RTR) agreement using the button below. This document confirms your consent for us to represent you to the client at the hourly rate we discussed.

The signing process takes just a few minutes - simply click the button, review the agreement, and add your electronic signature.

Thanks,
${recruiterName || 'Recruiting team'}`;

/** Custom modal that only closes when user clicks X or Cancel or submits. Does not close on blur/focus loss. */
function PipelineModal({
  open,
  onClose,
  title,
  description,
  children,
  className = 'sm:max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/80"
        aria-hidden
        onClick={(e) => e.stopPropagation()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-modal-title"
        aria-describedby="pipeline-modal-desc"
        className={cn(
          'relative z-50 grid w-full max-w-full gap-3 sm:gap-4 border bg-background p-4 sm:p-6 shadow-lg rounded-lg max-h-[95vh] overflow-y-auto',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="pipeline-modal-title" className="text-lg font-semibold leading-none tracking-tight">
                {title}
              </h2>
              <p id="pipeline-modal-desc" className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const PIPELINE_DRAFT_KEY = (type: string, appId: string) =>
  `pipeline-draft:${type}:${appId}`;

const PIPELINE_OPEN_MODAL_KEY = 'pipeline-open-modal';

export default function CandidatePipeline() {
  const { roles, currentRole, user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerParam = searchParams.get('owner');
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [draggedApp, setDraggedApp] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [documentCheckPending, setDocumentCheckPending] = useState<{ app: Application } | null>(null);
  const [docCheckTo, setDocCheckTo] = useState('');
  const [docCheckSubject, setDocCheckSubject] = useState('');
  const [docCheckBody, setDocCheckBody] = useState('');
  const [sendingDocCheck, setSendingDocCheck] = useState(false);
  const [rtrPending, setRtrPending] = useState<{ app: Application } | null>(null);
  const [rtrTo, setRtrTo] = useState('');
  const [rtrSubject, setRtrSubject] = useState('');
  const [rtrBody, setRtrBody] = useState('');
  const [rtrRate, setRtrRate] = useState('');
  const [rtrFieldValues, setRtrFieldValues] = useState<Record<string, string>>({});
  const [sendingRtr, setSendingRtr] = useState(false);
  const [screeningPending, setScreeningPending] = useState<{ app: Application } | null>(null);
  const [screeningDate, setScreeningDate] = useState<Date>();
  const [screeningTime, setScreeningTime] = useState('10:00');
  const [screeningDuration, setScreeningDuration] = useState(60);
  const [screeningType, setScreeningType] = useState('video');
  const [screeningMeetingLink, setScreeningMeetingLink] = useState('');
  const [screeningNotes, setScreeningNotes] = useState('');
  const [screeningToEmail, setScreeningToEmail] = useState('');
  const [sendingScreening, setSendingScreening] = useState(false);
  const [submissionPending, setSubmissionPending] = useState<{ app: Application } | null>(null);
  const [submissionToEmails, setSubmissionToEmails] = useState<string[]>([]);
  const [submissionSubject, setSubmissionSubject] = useState('');
  const [submissionBody, setSubmissionBody] = useState('');
  const [sendingSubmission, setSendingSubmission] = useState(false);
  const [outcomePending, setOutcomePending] = useState<{ app: Application } | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [outcomeComments, setOutcomeComments] = useState<string>('');
  const [movePending, setMovePending] = useState<{ app: Application; targetStatus: string; targetLabel: string } | null>(null);
  const [moveComments, setMoveComments] = useState<string>('');
  const [sendingOutcome, setSendingOutcome] = useState(false);
  const [commentsEditApp, setCommentsEditApp] = useState<Application | null>(null);
  const [commentsEditValue, setCommentsEditValue] = useState<string>('');

  const organizationId = orgIdForRecruiterSuite(roles);
  const viewAsOwnerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, ownerParam);

  // Persist pipeline form drafts so they survive tab blur or accidental close; restored when opening again for same candidate.
  useEffect(() => {
    if (!documentCheckPending?.app.id) return;
    try {
      sessionStorage.setItem(
        PIPELINE_DRAFT_KEY('doc-check', documentCheckPending.app.id),
        JSON.stringify({ to: docCheckTo, subject: docCheckSubject, body: docCheckBody }),
      );
    } catch {
      // ignore
    }
  }, [documentCheckPending?.app.id, docCheckTo, docCheckSubject, docCheckBody]);

  useEffect(() => {
    if (!rtrPending?.app.id) return;
    try {
      sessionStorage.setItem(
        PIPELINE_DRAFT_KEY('rtr', rtrPending.app.id),
        JSON.stringify({ to: rtrTo, subject: rtrSubject, body: rtrBody, rate: rtrRate, rtrFields: rtrFieldValues }),
      );
    } catch {
      // ignore
    }
  }, [rtrPending?.app.id, rtrTo, rtrSubject, rtrBody, rtrRate, rtrFieldValues]);

  useEffect(() => {
    if (!screeningPending?.app.id) return;
    try {
      sessionStorage.setItem(
        PIPELINE_DRAFT_KEY('screening', screeningPending.app.id),
        JSON.stringify({
          date: screeningDate?.toISOString(),
          time: screeningTime,
          duration: screeningDuration,
          type: screeningType,
          meetingLink: screeningMeetingLink,
          notes: screeningNotes,
          to: screeningToEmail,
        }),
      );
    } catch {
      // ignore
    }
  }, [screeningPending?.app.id, screeningDate, screeningTime, screeningDuration, screeningType, screeningMeetingLink, screeningNotes, screeningToEmail]);

  useEffect(() => {
    if (!submissionPending?.app.id) return;
    try {
      sessionStorage.setItem(
        PIPELINE_DRAFT_KEY('submission', submissionPending.app.id),
        JSON.stringify({
          toEmails: submissionToEmails,
          subject: submissionSubject,
          body: submissionBody,
        }),
      );
    } catch {
      // ignore
    }
  }, [submissionPending?.app.id, submissionToEmails, submissionSubject, submissionBody]);

  const { data: accountManagers } = useQuery({
    queryKey: ['account-managers', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.functions.invoke('get-org-account-managers', {
        body: { organizationId },
      });
      if (error) throw error;
      const list = (data as { accountManagers?: { user_id: string; email: string; full_name: string }[] } | null)?.accountManagers ?? [];
      return list;
    },
    enabled: !!organizationId,
  });

  // Default Submission modal to first account manager when opened with no draft
  useEffect(() => {
    if (submissionPending && accountManagers && accountManagers.length > 0 && submissionToEmails.length === 0) {
      setSubmissionToEmails([(accountManagers as { email: string }[])[0].email]);
    }
  }, [submissionPending, accountManagers, submissionToEmails.length]);

  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs', organizationId, viewAsOwnerId, user?.id],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase.from('jobs').select('id, title, recruiter_id, visibility').eq('organization_id', organizationId);
      if (viewAsOwnerId) {
        if (viewAsOwnerId === user?.id) {
          q = q.or(`recruiter_id.eq.${viewAsOwnerId},visibility.eq.public`);
        } else {
          q = q.eq('recruiter_id', viewAsOwnerId);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Auto-select job from query parameter if provided
  useEffect(() => {
    const jobParam = searchParams.get('job');
    if (jobParam && jobs && jobs.length > 0) {
      const jobExists = jobs.some((j: { id: string }) => j.id === jobParam);
      if (jobExists && selectedJob === 'all') {
        setSelectedJob(jobParam);
      }
    }
  }, [jobs, searchParams, selectedJob]);

  const { data: ownerProfile } = useQuery({
    queryKey: ['owner-profile-pipeline', viewAsOwnerId],
    queryFn: async () => {
      if (!viewAsOwnerId) return null;
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', viewAsOwnerId).maybeSingle();
      return data as { full_name: string | null } | null;
    },
    enabled: !!viewAsOwnerId,
  });

  const jobIds = (jobs || []).map((j: { id: string }) => j.id);

  const { data: applications, isLoading, isFetching } = useQuery({
    queryKey: ['pipeline-applications', organizationId, selectedJob, viewAsOwnerId, jobIds, user?.id],
    queryFn: async () => {
      if (!organizationId) return [];
      const selectFields = `id, candidate_id, job_id, status, applied_at, ai_match_score,
          candidate_profiles!inner(id, full_name, current_title, email, recruiter_notes),
          jobs!inner(id, title, organization_id, recruiter_id, visibility)`;
      let query = supabase
        .from('applications')
        .select(selectFields + ', outcome')
        .eq('jobs.organization_id', organizationId)
        .order('applied_at', { ascending: false });

      if (selectedJob !== 'all') {
        query = query.eq('job_id', selectedJob);
      } else if (viewAsOwnerId && jobIds.length > 0) {
        query = query.in('job_id', jobIds);
      }

      let result = await query;
      if (result.error) {
        if (result.error.message?.includes('outcome') || result.error.code === '42703') {
          query = supabase
            .from('applications')
            .select(selectFields)
            .eq('jobs.organization_id', organizationId)
            .order('applied_at', { ascending: false });
          if (selectedJob !== 'all') query = query.eq('job_id', selectedJob);
          else if (viewAsOwnerId && jobIds.length > 0) query = query.in('job_id', jobIds);
          result = await query;
        }
        if (result.error) throw result.error;
      }
      let apps = (result.data ?? []).map((row: Record<string, unknown>) => ({ ...row, outcome: row.outcome ?? null })) as unknown as Application[];

      if (viewAsOwnerId && jobIds.length > 0) {
        const { data: engagements } = await supabase
          .from('candidate_engagements')
          .select('job_id, candidate_id, owner_user_id')
          .in('job_id', jobIds);
        const engagementOwnerByKey = new Map<string, string>(
          (engagements ?? []).map((e: { job_id: string; candidate_id: string; owner_user_id: string | null }) => [
            `${e.job_id},${e.candidate_id}`,
            e.owner_user_id ?? '',
          ])
        );
        apps = apps.filter((app: Application) => {
          const job = (app as any).jobs;
          const key = `${app.job_id},${app.candidate_id}`;
          const engagementOwner = engagementOwnerByKey.get(key);
          if (engagementOwner != null && engagementOwner !== '') {
            return engagementOwner === viewAsOwnerId;
          }
          return job?.recruiter_id === viewAsOwnerId;
        });
      }

      return apps;
    },
    enabled:
      !!organizationId &&
      (selectedJob !== 'all' || !viewAsOwnerId || jobIds.length > 0) &&
      (viewAsOwnerId !== user?.id || jobs != null),
  });

  // When user navigates back to this page, restore the modal that was open (and its draft) from sessionStorage.
  useEffect(() => {
    if (!applications?.length) return;
    try {
      const raw = sessionStorage.getItem(PIPELINE_OPEN_MODAL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY);
      const { type, appId } = JSON.parse(raw) as { type: string; appId: string };
      const app = applications.find((a: Application) => a.id === appId) ?? null;
      if (!app) return;
      if (type === 'doc-check') {
        const draftRaw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('doc-check', appId));
        if (draftRaw) {
          const d = JSON.parse(draftRaw) as { to?: string; subject?: string; body?: string };
          if (d.to != null) setDocCheckTo(d.to);
          if (d.subject != null) setDocCheckSubject(d.subject);
          if (d.body != null) setDocCheckBody(d.body);
        } else {
          const email = app.candidate_profiles?.email?.trim() || '';
          const jobTitle = app.jobs?.title || 'this role';
          const candidateName = app.candidate_profiles?.full_name?.trim() || '';
          const recruiterName = (profile as { full_name?: string } | null)?.full_name?.trim() || 'Recruiting team';
          setDocCheckTo(email);
          setDocCheckSubject(DEFAULT_DOC_CHECK_SUBJECT(jobTitle));
          setDocCheckBody(DEFAULT_DOC_CHECK_BODY(candidateName, jobTitle, recruiterName));
        }
        setDocumentCheckPending({ app });
      } else if (type === 'rtr') {
        const draftRaw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('rtr', appId));
        if (draftRaw) {
          const d = JSON.parse(draftRaw) as { to?: string; subject?: string; body?: string; rate?: string; rtrFields?: Record<string, string> };
          if (d.to != null) setRtrTo(d.to);
          if (d.subject != null) setRtrSubject(d.subject);
          if (d.body != null) setRtrBody(d.body);
          if (d.rate != null) setRtrRate(d.rate);
          if (d.rtrFields && typeof d.rtrFields === 'object') setRtrFieldValues(d.rtrFields);
          else setRtrFieldValues({});
        } else {
          const email = app.candidate_profiles?.email?.trim() || '';
          const jobTitle = app.jobs?.title || 'this role';
          const candidateName = app.candidate_profiles?.full_name?.trim() || '';
          const recruiterName = (profile as { full_name?: string } | null)?.full_name?.trim() || 'Recruiting team';
          setRtrTo(email);
          setRtrSubject(DEFAULT_RTR_SUBJECT(jobTitle));
          setRtrBody(DEFAULT_RTR_BODY(candidateName, jobTitle, recruiterName));
          setRtrRate('');
          const defaults: Record<string, string> = {};
          RTR_RECRUITER_FIELDS.forEach((f) => {
            defaults[f.key] = getDefaultRtrFieldValue(f.key, { candidateName, jobTitle });
          });
          setRtrFieldValues(defaults);
        }
        setRtrPending({ app });
      } else if (type === 'screening') {
        const candidateEmail = app.candidate_profiles?.email ?? '';
        const draftRaw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('screening', appId));
        if (draftRaw) {
          const d = JSON.parse(draftRaw) as {
            date?: string;
            time?: string;
            duration?: number;
            type?: string;
            meetingLink?: string;
            notes?: string;
            to?: string;
          };
          if (d.date) setScreeningDate(new Date(d.date));
          if (d.time != null) setScreeningTime(d.time);
          if (d.duration != null) setScreeningDuration(d.duration);
          if (d.type != null) setScreeningType(d.type);
          if (d.meetingLink != null) setScreeningMeetingLink(d.meetingLink);
          if (d.notes != null) setScreeningNotes(d.notes);
          setScreeningToEmail(d.to ?? candidateEmail);
        } else {
          setScreeningDate(undefined);
          setScreeningTime('10:00');
          setScreeningDuration(60);
          setScreeningType('video');
          setScreeningMeetingLink('');
          setScreeningNotes('');
          setScreeningToEmail(candidateEmail);
        }
        setScreeningPending({ app });
      } else if (type === 'submission') {
        const draftRaw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('submission', appId));
        if (draftRaw) {
          const d = JSON.parse(draftRaw) as { toEmails?: string[]; subject?: string; body?: string };
          if (Array.isArray(d.toEmails)) setSubmissionToEmails(d.toEmails);
          if (d.subject != null) setSubmissionSubject(d.subject);
          if (d.body != null) setSubmissionBody(d.body);
        } else {
          setSubmissionToEmails([]);
          setSubmissionSubject('');
          setSubmissionBody('');
        }
        setSubmissionPending({ app });
      }
    } catch {
      // ignore
    }
  }, [applications, profile]);

  const selectedJobTitle =
    selectedJob === 'all'
      ? 'All Jobs'
      : (jobs || []).find((j: any) => String(j.id) === String(selectedJob))?.title || 'Selected Job';

  const totalVisible = applications?.length || 0;

  const updateStatus = useMutation({
    mutationFn: async ({ appId, status, candidateId, outcome, recruiter_notes }: { appId: string; status: string; candidateId?: string; outcome?: string | null; recruiter_notes?: string | null }) => {
      const { error } = await supabase.rpc('update_application_status', {
        _application_id: appId,
        _status: status,
        _candidate_id: candidateId || null,
        _outcome: status === 'final_update' && outcome != null ? String(outcome).trim() || null : null,
        _recruiter_notes: recruiter_notes != null ? String(recruiter_notes).trim() || null : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['application-detail'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      toast.success('Candidate moved');
    },
    onError: (err: Error & { code?: string; message?: string }) => {
      const msg = err?.message ?? '';
      toast.error(msg ? `Failed to update status: ${msg}` : 'Failed to update status');
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ candidateId, notes }: { candidateId: string; notes: string }) => {
      const { error } = await supabase.rpc('update_candidate_recruiter_notes', {
        _candidate_id: candidateId,
        _notes: notes.trim() || '',
      });
      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('do not have access') || msg.includes('not found')) {
          const ownerName = ownerProfile?.full_name?.trim() || 'the recruiter';
          throw new Error(`You cannot update comments for this candidate as the pipeline is owned by ${ownerName}.`);
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      setCommentsEditApp(null);
      toast.success('Comments saved');
    },
    onError: (err: Error) => toast.error(err?.message ?? 'Failed to save comments'),
  });

  const handleDragStart = (e: React.DragEvent, appId: string) => {
    setDraggedApp(appId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };

  const isViewingAsManager = (currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin') && !!ownerParam;

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (!draggedApp) {
      setDragOverStage(null);
      return;
    }
    if (isViewingAsManager) {
      const ownerName = ownerProfile?.full_name?.trim() || 'the recruiter';
      toast.error(`You cannot move this candidate as the pipeline is owned by ${ownerName}.`);
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'document_check') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const email = app.candidate_profiles?.email?.trim();
      if (!email) {
        toast.error('Candidate has no email; add it in their profile first.');
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const jobTitle = app.jobs?.title || 'this role';
      const candidateName = app.candidate_profiles?.full_name?.trim() || '';
      const recruiterName = (profile as { full_name?: string } | null)?.full_name?.trim() || 'Recruiting team';
      const isSameCandidate = documentCheckPending?.app.id === app.id;
      if (!isSameCandidate) {
        try {
          const raw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('doc-check', app.id));
          if (raw) {
            const d = JSON.parse(raw) as { to?: string; subject?: string; body?: string };
            if (d.to != null) setDocCheckTo(d.to);
            if (d.subject != null) setDocCheckSubject(d.subject);
            if (d.body != null) setDocCheckBody(d.body);
          } else {
            setDocCheckTo(email);
            setDocCheckSubject(DEFAULT_DOC_CHECK_SUBJECT(jobTitle));
            setDocCheckBody(DEFAULT_DOC_CHECK_BODY(candidateName, jobTitle, recruiterName));
          }
        } catch {
          setDocCheckTo(email);
          setDocCheckSubject(DEFAULT_DOC_CHECK_SUBJECT(jobTitle));
          setDocCheckBody(DEFAULT_DOC_CHECK_BODY(candidateName, jobTitle, recruiterName));
        }
      }
      setDocumentCheckPending({ app });
      try { sessionStorage.setItem(PIPELINE_OPEN_MODAL_KEY, JSON.stringify({ type: 'doc-check', appId: app.id })); } catch { /* ignore */ }
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'rtr_rate') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const email = app.candidate_profiles?.email?.trim();
      if (!email) {
        toast.error('Candidate has no email; add it in their profile first.');
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const jobTitle = app.jobs?.title || 'this role';
      const candidateName = app.candidate_profiles?.full_name?.trim() || '';
      const recruiterName = (profile as { full_name?: string } | null)?.full_name?.trim() || 'Recruiting team';
      const isSameCandidate = rtrPending?.app.id === app.id;
      if (!isSameCandidate) {
        try {
          const raw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('rtr', app.id));
          if (raw) {
            const d = JSON.parse(raw) as { to?: string; subject?: string; body?: string; rate?: string; rtrFields?: Record<string, string> };
            if (d.to != null) setRtrTo(d.to);
            if (d.subject != null) setRtrSubject(d.subject);
            if (d.body != null) setRtrBody(d.body);
            if (d.rate != null) setRtrRate(d.rate);
            if (d.rtrFields && typeof d.rtrFields === 'object') setRtrFieldValues(d.rtrFields);
            else setRtrFieldValues({});
          } else {
            setRtrTo(email);
            setRtrSubject(DEFAULT_RTR_SUBJECT(jobTitle));
            setRtrBody(DEFAULT_RTR_BODY(candidateName, jobTitle, recruiterName));
            setRtrRate('');
            const defaults: Record<string, string> = {};
            RTR_RECRUITER_FIELDS.forEach((f) => {
              defaults[f.key] = getDefaultRtrFieldValue(f.key, { candidateName, jobTitle });
            });
            setRtrFieldValues(defaults);
          }
        } catch {
          setRtrTo(email);
          setRtrSubject(DEFAULT_RTR_SUBJECT(jobTitle));
          setRtrBody(DEFAULT_RTR_BODY(candidateName, jobTitle, recruiterName));
          setRtrRate('');
          const defaults: Record<string, string> = {};
          RTR_RECRUITER_FIELDS.forEach((f) => {
            defaults[f.key] = getDefaultRtrFieldValue(f.key, { candidateName, jobTitle });
          });
          setRtrFieldValues(defaults);
        }
      }
      setRtrPending({ app });
      try { sessionStorage.setItem(PIPELINE_OPEN_MODAL_KEY, JSON.stringify({ type: 'rtr', appId: app.id })); } catch { /* ignore */ }
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'screening') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const isSameCandidate = screeningPending?.app.id === app.id;
      if (!isSameCandidate) {
        try {
          const raw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('screening', app.id));
          const candidateEmail = app.candidate_profiles?.email ?? '';
          if (raw) {
            const d = JSON.parse(raw) as {
              date?: string;
              time?: string;
              duration?: number;
              type?: string;
              meetingLink?: string;
              notes?: string;
              to?: string;
            };
            if (d.date) setScreeningDate(new Date(d.date));
            if (d.time != null) setScreeningTime(d.time);
            if (d.duration != null) setScreeningDuration(d.duration);
            if (d.type != null) setScreeningType(d.type);
            if (d.meetingLink != null) setScreeningMeetingLink(d.meetingLink);
            if (d.notes != null) setScreeningNotes(d.notes);
            if (d.to != null) setScreeningToEmail(d.to);
            else setScreeningToEmail(candidateEmail);
          } else {
            setScreeningDate(undefined);
            setScreeningTime('10:00');
            setScreeningDuration(60);
            setScreeningType('video');
            setScreeningMeetingLink('');
            setScreeningNotes('');
            setScreeningToEmail(candidateEmail);
          }
        } catch {
          setScreeningDate(undefined);
          setScreeningTime('10:00');
          setScreeningDuration(60);
          setScreeningType('video');
          setScreeningMeetingLink('');
          setScreeningNotes('');
          setScreeningToEmail(app.candidate_profiles?.email ?? '');
        }
      }
      setScreeningPending({ app });
      try { sessionStorage.setItem(PIPELINE_OPEN_MODAL_KEY, JSON.stringify({ type: 'screening', appId: app.id })); } catch { /* ignore */ }
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'submission') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const isSameCandidate = submissionPending?.app.id === app.id;
      const jobTitle = app.jobs?.title || 'this role';
      const candidateName = app.candidate_profiles?.full_name?.trim() || app.candidate_profiles?.email?.split('@')[0] || 'Candidate';
      if (!isSameCandidate) {
        try {
          const raw = sessionStorage.getItem(PIPELINE_DRAFT_KEY('submission', app.id));
          if (raw) {
            const d = JSON.parse(raw) as { toEmails?: string[]; subject?: string; body?: string };
            if (Array.isArray(d.toEmails)) setSubmissionToEmails(d.toEmails);
            if (d.subject != null) setSubmissionSubject(d.subject);
            if (d.body != null) setSubmissionBody(d.body);
          } else {
            setSubmissionToEmails([]);
            setSubmissionSubject(`Candidate submission – ${jobTitle}`);
            const recruiterName = profile?.full_name ?? 'Recruiter';
            setSubmissionBody(`Dear Manager,\n\nPlease find attached the resume for ${candidateName}, submitted for ${jobTitle}.\n\nBest regards,\n${recruiterName}`);
          }
        } catch {
          setSubmissionToEmails([]);
          setSubmissionSubject(`Candidate submission – ${jobTitle}`);
          const recruiterName = profile?.full_name ?? 'Recruiter';
          setSubmissionBody(`Dear Manager,\n\nPlease find attached the resume for ${candidateName}, submitted for ${jobTitle}.\n\nBest regards,\n${recruiterName}`);
        }
      }
      setSubmissionPending({ app });
      try { sessionStorage.setItem(PIPELINE_OPEN_MODAL_KEY, JSON.stringify({ type: 'submission', appId: app.id })); } catch { /* ignore */ }
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'final_update') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      setSelectedOutcome(app.outcome || '');
      setOutcomeComments(app.candidate_profiles?.recruiter_notes ?? '');
      setOutcomePending({ app });
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === APPLIED_ENGAGED_STAGE_ID) {
      const app = applications?.find((a) => a.id === draggedApp);
      const backStatus = app?.status === 'outreach' ? 'outreach' : 'applied';
      updateStatus.mutate({ appId: draggedApp, status: backStatus, candidateId: app?.candidate_id });
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    if (status === 'screening') {
      const app = applications?.find((a) => a.id === draggedApp);
      if (!app) {
        setDraggedApp(null);
        setDragOverStage(null);
        return;
      }
      const stage = PIPELINE_STAGES.find((s) => s.id === 'screening');
      setMoveComments(app.candidate_profiles?.recruiter_notes ?? '');
      setMovePending({ app, targetStatus: 'screening', targetLabel: stage?.label ?? 'Screening' });
      setDraggedApp(null);
      setDragOverStage(null);
      return;
    }
    const app = applications?.find((a) => a.id === draggedApp);
    updateStatus.mutate({ appId: draggedApp, status, candidateId: app?.candidate_id });
    setDraggedApp(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedApp(null);
    setDragOverStage(null);
  };

  const getApplicationsByStatus = (status: string) => {
    if (status === APPLIED_ENGAGED_STAGE_ID) {
      return applications?.filter(app => app.status === 'outreach' || app.status === 'applied') || [];
    }
    return applications?.filter(app => applicationStageColumnKey(app.status) === status) || [];
  };

  const appsByStage = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const s of PIPELINE_STAGES) map.set(s.id, []);
    for (const app of (applications || [])) {
      const k =
        app.status === 'outreach' || app.status === 'applied'
          ? APPLIED_ENGAGED_STAGE_ID
          : applicationStageColumnKey(app.status);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(app);
    }
    return map;
  }, [applications]);

  const openApplication = (appId: string) => {
    setSelectedApplicationId(appId);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="flex items-center justify-center flex-1 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-recruiter" strokeWidth={1.5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {isViewingAsManager && (
          <p className="text-sm text-red-600 dark:text-red-400 shrink-0 mb-4">
            Viewing <span className="font-medium">{ownerProfile?.full_name || 'this recruiter'}</span>&apos;s application pipeline.
          </p>
        )}
        {/* Header - clearly separated from pipeline */}
        <div className="shrink-0 pb-4 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20 shrink-0">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground">
                  <span className="text-foreground">Jobs → Candidates</span> <span className="text-gradient-recruiter">Pipeline</span>
                </h1>
              </div>
              <p className="text-base sm:text-lg text-muted-foreground font-sans mt-1">
                Manage and track candidate progress through stages.
              </p>
            </div>
            <Select value={selectedJob} onValueChange={(v) => setSelectedJob(String(v))}>
              <SelectTrigger className="w-full md:w-56 lg:w-64 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans shrink-0">
                <SelectValue placeholder="Filter by job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs?.map(job => (
                  <SelectItem key={job.id} value={String(job.id)}>
                    <span className="block truncate max-w-full">{job.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Kanban Board - responsive columns */}
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 pb-6 min-w-0 w-full">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage.id}
                className="flex flex-col h-full min-w-0 flex-1"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                onDragLeave={() => {
                  if (dragOverStage === stage.id) setDragOverStage(null);
                }}
              >
                {/* Column Header - compact title and count; distinct bg per stage */}
                <div className={`mb-2 flex items-center justify-between gap-2 py-2 px-2.5 min-h-0 rounded-lg border border-slate-300 dark:border-slate-700 ${stage.headerBg} ${dragOverStage === stage.id ? 'ring-2 ring-primary/50' : ''}`}>
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${stage.dot} shadow-[0_0_8px_currentColor]`} />
                    <span className="font-display font-bold text-xs tracking-tight text-foreground break-words leading-tight">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="bg-black/5 dark:bg-white/10 text-foreground font-mono text-[10px] shrink-0 h-5 min-w-5 justify-center px-1">
                    {appsByStage.get(stage.id)?.length || 0}
                  </Badge>
                </div>

                {/* Drop Zone / List */}
                <div className={`min-h-[250px] sm:min-h-[300px] lg:min-h-[350px] flex-1 overflow-y-auto rounded-xl sm:rounded-2xl p-1.5 sm:p-2 space-y-2 border transition-colors duration-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] ${dragOverStage === stage.id
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                  }`}>
                  {(appsByStage.get(stage.id)?.length || 0) === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl m-1 opacity-50">
                      <p className="text-xs font-medium">Empty</p>
                    </div>
                  ) : (
                    (appsByStage.get(stage.id) || []).map((app, idx) => (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, app.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => openApplication(app.id)}
                        className={`
                          group relative p-3 rounded-xl border border-slate-200 dark:border-slate-700
                          bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5
                          transition-all duration-200 cursor-grab active:cursor-grabbing
                          border-l-[3px] border-l-primary
                          ${draggedApp === app.id ? 'opacity-40 rotate-2 scale-95 ring-2 ring-primary/50' : ''}
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 border border-slate-100 dark:border-slate-700 shadow-sm shrink-0">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[10px] font-bold">
                              {(app.candidate_profiles?.full_name || 'U').charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100 truncate">
                                  {app.candidate_profiles?.full_name || (app.candidate_profiles?.email ? String(app.candidate_profiles.email).split('@')[0] : null) || 'Applicant'}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                  {app.jobs?.title || '—'}
                                </p>
                                {stage.id === 'final_update' && app.outcome && (
                                  <Badge variant="secondary" className="mt-1.5 text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                    {getFinalOutcomeLabel(app.outcome)}
                                  </Badge>
                                )}
                                <Popover
                                  open={commentsEditApp?.id === app.id}
                                  onOpenChange={(open) => {
                                    if (!open) setCommentsEditApp(null);
                                  }}
                                >
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                          <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCommentsEditApp(app);
                                              setCommentsEditValue(app.candidate_profiles?.recruiter_notes ?? '');
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setCommentsEditApp(app);
                                                setCommentsEditValue(app.candidate_profiles?.recruiter_notes ?? '');
                                              }
                                            }}
                                            className="mt-1.5 text-[10px] truncate max-w-full cursor-pointer flex items-center gap-1.5 rounded-md px-2 py-1 -mx-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200/90 border border-amber-200/60 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700/50 transition-colors"
                                          >
                                            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                            {(app.candidate_profiles?.recruiter_notes != null && app.candidate_profiles.recruiter_notes !== '') ? (
                                              app.candidate_profiles.recruiter_notes.length <= COMMENTS_PREVIEW_LEN
                                                ? app.candidate_profiles.recruiter_notes
                                                : `${app.candidate_profiles.recruiter_notes.slice(0, COMMENTS_PREVIEW_LEN)}…`
                                            ) : (
                                              <span className="italic opacity-90">Add comment…</span>
                                            )}
                                          </div>
                                        </PopoverTrigger>
                                      </TooltipTrigger>
                                      {(app.candidate_profiles?.recruiter_notes != null && app.candidate_profiles.recruiter_notes !== '') && (
                                        <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-left">
                                          {app.candidate_profiles.recruiter_notes}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                  <PopoverContent
                                    className="w-80 p-3"
                                    align="start"
                                    onClick={(e) => e.stopPropagation()}
                                    onOpenAutoFocus={(e) => e.preventDefault()}
                                  >
                                    {commentsEditApp?.id === app.id && (
                                      <div className="space-y-2">
                                        <Label className="text-xs">Comments</Label>
                                        <Textarea
                                          placeholder="Add or update notes about this candidate…"
                                          value={commentsEditValue}
                                          onChange={(e) => setCommentsEditValue(e.target.value)}
                                          className="min-h-[80px] resize-none text-sm"
                                          rows={3}
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCommentsEditApp(null)}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            disabled={updateNotesMutation.isPending}
                                            onClick={() => {
                                              if (!commentsEditApp) return;
                                              updateNotesMutation.mutate({
                                                candidateId: commentsEditApp.candidate_id,
                                                notes: commentsEditValue,
                                              });
                                            }}
                                          >
                                            {updateNotesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-grab text-slate-400 hover:text-slate-600 shrink-0">
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ApplicantDetailSheet
        applicationId={selectedApplicationId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedApplicationId(null);
        }}
      />

      {/* Doc check: custom modal so it never closes on blur; draft saved to sessionStorage */}
      <PipelineModal
        open={!!documentCheckPending}
        onClose={() => {
          const appId = documentCheckPending?.app.id;
          if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('doc-check', appId)); } catch { /* ignore */ }
          try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
          setDocumentCheckPending(null);
        }}
        title="Request verification documents"
        description="Send an email asking for ID, visa status, I-94, etc. Once sent, the candidate will be moved to Doc check."
      >
        {documentCheckPending && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="email"
                value={docCheckTo}
                onChange={(e) => setDocCheckTo(e.target.value)}
                className="font-sans"
                placeholder="candidate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={docCheckSubject}
                onChange={(e) => setDocCheckSubject(e.target.value)}
                className="font-sans"
                placeholder="Subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={docCheckBody}
                onChange={(e) => setDocCheckBody(e.target.value)}
                rows={12}
                className="resize-y font-sans"
                placeholder="Email body..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  const appId = documentCheckPending?.app.id;
                  if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('doc-check', appId)); } catch { /* ignore */ }
                  try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
                  setDocumentCheckPending(null);
                }}
                disabled={sendingDocCheck}
              >
                Cancel
              </Button>
              <Button
                disabled={sendingDocCheck || !docCheckTo.trim() || !docCheckSubject.trim() || !docCheckBody.trim() || !organizationId}
                onClick={async () => {
                  if (!documentCheckPending || !organizationId) return;
                  setSendingDocCheck(true);
                  try {
                    const { error } = await supabase.functions.invoke('send-pipeline-email', {
                      body: {
                        toEmail: docCheckTo.trim(),
                        subject: docCheckSubject.trim(),
                        body: docCheckBody.trim(),
                        organizationId,
                      },
                    });
                    if (error) {
                      const message = await getEdgeFunctionErrorMessage(error);
                      toast.error(message || 'Failed to send email');
                      return;
                    }
                    const appId = documentCheckPending.app.id;
                    try {
                      sessionStorage.removeItem(PIPELINE_DRAFT_KEY('doc-check', appId));
                      sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY);
                    } catch { /* ignore */ }
                    updateStatus.mutate({
                      appId,
                      status: 'document_check',
                      candidateId: documentCheckPending.app.candidate_id,
                    });
                    setDocumentCheckPending(null);
                    toast.success('Email sent and candidate moved to Doc check');
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to send email';
                    toast.error(message);
                  } finally {
                    setSendingDocCheck(false);
                  }
                }}
              >
                {sendingDocCheck ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send & move to Doc check
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>

      {/* RTR & rate: custom modal so it never closes on blur; draft saved to sessionStorage */}
      <PipelineModal
        open={!!rtrPending}
        onClose={() => {
          const appId = rtrPending?.app.id;
          if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('rtr', appId)); } catch { /* ignore */ }
          try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
          setRtrPending(null);
        }}
        title="Send RTR (Right to Represent)"
        description="Fill in the RTR form fields below. They will be merged into the template DOCX, converted to a fillable PDF (candidate can complete remaining fields), and attached to the email."
      >
        {rtrPending && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-medium">RTR form fields (pre-filled in PDF)</Label>
              <ScrollArea className="h-[220px] rounded-md border p-3">
                <div className="space-y-3">
                  {RTR_RECRUITER_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      <Input
                        value={rtrFieldValues[f.key] ?? ''}
                        onChange={(e) => setRtrFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="font-sans text-sm"
                        placeholder={f.key === 'rate' ? 'e.g. $90 per hour' : f.label}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="email"
                value={rtrTo}
                onChange={(e) => setRtrTo(e.target.value)}
                className="font-sans"
                placeholder="candidate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={rtrSubject}
                onChange={(e) => setRtrSubject(e.target.value)}
                className="font-sans"
                placeholder="Subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={rtrBody}
                onChange={(e) => setRtrBody(e.target.value)}
                rows={8}
                className="resize-y font-sans"
                placeholder="Email body..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  const appId = rtrPending?.app.id;
                  if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('rtr', appId)); } catch { /* ignore */ }
                  try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
                  setRtrPending(null);
                }}
                disabled={sendingRtr}
              >
                Cancel
              </Button>
              <Button
                disabled={sendingRtr || !rtrTo.trim() || !rtrSubject.trim() || !rtrBody.trim() || !(rtrFieldValues.rate ?? rtrRate).trim() || !organizationId}
                onClick={async () => {
                  if (!rtrPending || !organizationId) return;
                  setSendingRtr(true);
                  try {
                    const rateVal = (rtrFieldValues.rate ?? rtrRate).trim();
                    const { data, error } = await invokeFunction('send-rtr-email', {
                      body: {
                        toEmail: rtrTo.trim(),
                        subject: rtrSubject.trim(),
                        body: rtrBody.trim(),
                        rate: rateVal,
                        rtrFields: rtrFieldValues,
                        organizationId,
                        candidateId: rtrPending.app.candidate_id,
                        jobId: rtrPending.app.job_id,
                        applicationId: rtrPending.app.id,
                      },
                    });
                    if (error) {
                      const message = await getEdgeFunctionErrorMessage(error);
                      toast.error(message || 'Failed to send RTR email');
                      return;
                    }
                    const appId = rtrPending.app.id;
                    await updateStatus.mutateAsync({
                      appId,
                      status: 'rtr_rate',
                      candidateId: rtrPending.app.candidate_id,
                    });
                    try {
                      sessionStorage.removeItem(PIPELINE_DRAFT_KEY('rtr', appId));
                      sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY);
                    } catch { /* ignore */ }
                    setRtrPending(null);
                    const successMsg = data?.signing_url
                      ? 'RTR sent! Candidate will receive signing link via email.'
                      : 'RTR email sent and candidate moved to RTR & rate';
                    toast.success(successMsg);
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to send RTR email or move candidate';
                    toast.error(message);
                  } finally {
                    setSendingRtr(false);
                  }
                }}
              >
                {sendingRtr ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send RTR & move to RTR & rate
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>

      {/* Screening: custom modal so it never closes on blur; draft saved to sessionStorage */}
      <PipelineModal
        open={!!screeningPending}
        onClose={() => {
          const appId = screeningPending?.app.id;
          if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('screening', appId)); } catch { /* ignore */ }
          try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
          setScreeningPending(null);
        }}
        title="Schedule screening interview"
        description="Set the interview date and details. A calendar invite (.ics) will be emailed to the address below so the candidate can add it to their calendar. The candidate will move to Screening and the interview will appear under Interviews."
      >
        {screeningPending && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">
                {screeningPending.app.candidate_profiles?.full_name || screeningPending.app.candidate_profiles?.email?.split('@')[0] || 'Candidate'}
              </p>
              <p className="text-muted-foreground">{screeningPending.app.jobs?.title || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>Send calendar invite to</Label>
              <Input
                type="email"
                value={screeningToEmail}
                onChange={(e) => setScreeningToEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="font-sans"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !screeningDate && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {screeningDate ? format(screeningDate, 'PPP') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={screeningDate}
                      onSelect={setScreeningDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={screeningTime}
                  onChange={(e) => setScreeningTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={screeningType} onValueChange={setScreeningType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video Call</SelectItem>
                    <SelectItem value="phone">Phone Screen</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={String(screeningDuration)} onValueChange={(v) => setScreeningDuration(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meeting link</Label>
              <Input
                value={screeningMeetingLink}
                onChange={(e) => setScreeningMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={screeningNotes}
                onChange={(e) => setScreeningNotes(e.target.value)}
                placeholder="Focus areas, topics to cover..."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  const appId = screeningPending?.app.id;
                  if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('screening', appId)); } catch { /* ignore */ }
                  try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
                  setScreeningPending(null);
                }}
                disabled={sendingScreening}
              >
                Cancel
              </Button>
              <Button
                disabled={sendingScreening || !screeningDate || !screeningToEmail.trim() || !user?.id}
                onClick={async () => {
                  if (!screeningPending || !user?.id) return;
                  setSendingScreening(true);
                  try {
                    const [hours, minutes] = screeningTime.split(':').map(Number);
                    const scheduledAt = new Date(screeningDate);
                    scheduledAt.setHours(hours, minutes, 0, 0);
                    const { error: insertErr } = await supabase.from('interview_schedules').insert({
                      application_id: screeningPending.app.id,
                      interviewer_id: user.id,
                      interview_type: screeningType,
                      scheduled_at: scheduledAt.toISOString(),
                      duration_minutes: screeningDuration,
                      meeting_link: screeningMeetingLink.trim() || null,
                      notes: screeningNotes.trim() || null,
                      status: 'scheduled',
                    });
                    if (insertErr) throw insertErr;
                    const appId = screeningPending.app.id;
                    const jobTitle = screeningPending.app.jobs?.title || 'Screening';
                    const candidateName = screeningPending.app.candidate_profiles?.full_name || screeningPending.app.candidate_profiles?.email || '';
                    let inviteSent = false;
                    try {
                      const { error: inviteErr } = await supabase.functions.invoke('send-screening-invite', {
                        body: {
                          toEmail: screeningToEmail.trim(),
                          scheduledAt: scheduledAt.toISOString(),
                          durationMinutes: screeningDuration,
                          meetingLink: screeningMeetingLink.trim() || undefined,
                          jobTitle,
                          candidateName,
                          notes: screeningNotes.trim() || undefined,
                          organizationId: organizationId ?? undefined,
                        },
                      });
                      if (!inviteErr) inviteSent = true;
                      else console.warn('Screening invite failed:', inviteErr);
                    } catch (e) {
                      console.warn('Screening invite error:', e);
                    }
                    try {
                      sessionStorage.removeItem(PIPELINE_DRAFT_KEY('screening', appId));
                      sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY);
                    } catch { /* ignore */ }
                    updateStatus.mutate({
                      appId,
                      status: 'screening',
                      candidateId: screeningPending.app.candidate_id,
                    });
                    queryClient.invalidateQueries({ queryKey: ['interviews'], exact: false });
                    setScreeningPending(null);
                    toast.success(inviteSent
                      ? 'Interview scheduled, calendar invite sent, and candidate moved to Screening'
                      : 'Interview scheduled and candidate moved to Screening (calendar invite could not be sent)');
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : 'Failed to schedule');
                  } finally {
                    setSendingScreening(false);
                  }
                }}
              >
                {sendingScreening ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarIcon className="h-4 w-4 mr-2" />}
                Schedule & move to Screening
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>

      {/* Submission: send to account manager(s) with resume attached, then move to Submission */}
      <PipelineModal
        open={!!submissionPending}
        onClose={() => {
          const appId = submissionPending?.app.id;
          if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('submission', appId)); } catch { /* ignore */ }
          try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
          setSubmissionPending(null);
        }}
        title="Submit to account manager"
        description="Select an account manager. The candidate's resume will be attached to the email and the candidate will be moved to Submission."
      >
        {submissionPending && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">
                {submissionPending.app.candidate_profiles?.full_name || submissionPending.app.candidate_profiles?.email?.split('@')[0] || 'Candidate'}
              </p>
              <p className="text-muted-foreground">{submissionPending.app.jobs?.title || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>Account manager</Label>
              {(!accountManagers || accountManagers.length === 0) ? (
                <p className="text-sm text-muted-foreground">No account managers in this organization. Add them from Org Admin.</p>
              ) : (
                <Select
                  value={submissionToEmails[0] ?? ''}
                  onValueChange={(email) => setSubmissionToEmails(email ? [email] : [])}
                >
                  <SelectTrigger className="w-full font-sans">
                    <SelectValue placeholder="Select account manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accountManagers as { email: string; full_name: string }[]).map((am) => (
                      <SelectItem key={am.email} value={am.email}>
                        {am.full_name} &lt;{am.email}&gt;
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={submissionSubject}
                onChange={(e) => setSubmissionSubject(e.target.value)}
                className="font-sans"
                placeholder="Candidate submission – Job title"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={submissionBody}
                onChange={(e) => setSubmissionBody(e.target.value)}
                rows={6}
                className="resize-y font-sans"
                placeholder="Email body..."
              />
            </div>
            <p className="text-xs text-muted-foreground">The candidate&apos;s resume will be attached automatically when available.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  const appId = submissionPending?.app.id;
                  if (appId) try { sessionStorage.removeItem(PIPELINE_DRAFT_KEY('submission', appId)); } catch { /* ignore */ }
                  try { sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY); } catch { /* ignore */ }
                  setSubmissionPending(null);
                }}
                disabled={sendingSubmission}
              >
                Cancel
              </Button>
              <Button
                disabled={sendingSubmission || submissionToEmails.length === 0 || !submissionSubject.trim() || !submissionBody.trim() || !organizationId}
                onClick={async () => {
                  if (!submissionPending || !organizationId) return;
                  setSendingSubmission(true);
                  try {
                    const { error } = await supabase.functions.invoke('send-submission-email', {
                      body: {
                        toEmails: submissionToEmails,
                        subject: submissionSubject.trim(),
                        body: submissionBody.trim(),
                        organizationId,
                        candidateId: submissionPending.app.candidate_id,
                      },
                    });
                    if (error) {
                      const message = await getEdgeFunctionErrorMessage(error);
                      toast.error(message || 'Failed to send submission email');
                      return;
                    }
                    const appId = submissionPending.app.id;
                    try {
                      sessionStorage.removeItem(PIPELINE_DRAFT_KEY('submission', appId));
                      sessionStorage.removeItem(PIPELINE_OPEN_MODAL_KEY);
                    } catch { /* ignore */ }
                    updateStatus.mutate({
                      appId,
                      status: 'submission',
                      candidateId: submissionPending.app.candidate_id,
                    });
                    setSubmissionPending(null);
                    toast.success('Email sent with resume and candidate moved to Submission');
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to send';
                    toast.error(message);
                  } finally {
                    setSendingSubmission(false);
                  }
                }}
              >
                {sendingSubmission ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send & move to Submission
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>

      {/* Outcome: record manager feedback (Client rejected, Job offered, etc.) */}
      <PipelineModal
        open={!!outcomePending}
        onClose={() => {
          setOutcomePending(null);
          setOutcomeComments('');
        }}
        title="Record outcome"
        description="Select the outcome from the manager (or what happened after submission). This will be shown against the candidate."
      >
        {outcomePending && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">
                {outcomePending.app.candidate_profiles?.full_name || outcomePending.app.candidate_profiles?.email?.split('@')[0] || 'Candidate'}
              </p>
              <p className="text-muted-foreground">{outcomePending.app.jobs?.title || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select
                value={selectedOutcome}
                onValueChange={setSelectedOutcome}
              >
                <SelectTrigger className="w-full font-sans">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {FINAL_OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comments (optional)</Label>
              <Textarea
                placeholder="Add or update notes about this candidate…"
                value={outcomeComments}
                onChange={(e) => setOutcomeComments(e.target.value)}
                className="min-h-[80px] resize-none text-sm font-sans"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setOutcomePending(null)}
                disabled={sendingOutcome}
              >
                Cancel
              </Button>
              <Button
                disabled={sendingOutcome || !selectedOutcome.trim()}
                onClick={() => {
                  if (!outcomePending) return;
                  setSendingOutcome(true);
                  updateStatus.mutate(
                    {
                      appId: outcomePending.app.id,
                      status: 'final_update',
                      outcome: selectedOutcome.trim(),
                      candidateId: outcomePending.app.candidate_id,
                      recruiter_notes: outcomeComments.trim() || undefined,
                    },
                    {
                      onSuccess: (data: { outcomeColumnMissing?: boolean } | void) => {
                        setOutcomePending(null);
                        setSelectedOutcome('');
                        setSendingOutcome(false);
                        if (!(data as { outcomeColumnMissing?: boolean })?.outcomeColumnMissing) {
                          toast.success('Outcome saved');
                        }
                      },
                      onError: () => {
                        setSendingOutcome(false);
                      },
                    }
                  );
                }}
              >
                {sendingOutcome ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save outcome
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>

      {/* Move to stage (e.g. Screening): optional comments */}
      <PipelineModal
        open={!!movePending}
        onClose={() => {
          setMovePending(null);
          setMoveComments('');
        }}
        title={`Move to ${movePending?.targetLabel ?? 'stage'}`}
        description="Add or update comments for this candidate (optional). Comments are shown on hover in the pipeline and in Talent Pool."
      >
        {movePending && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">
                {movePending.app.candidate_profiles?.full_name || movePending.app.candidate_profiles?.email?.split('@')[0] || 'Candidate'}
              </p>
              <p className="text-muted-foreground">{movePending.app.jobs?.title || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>Comments (optional)</Label>
              <Textarea
                placeholder="Add or update notes about this candidate…"
                value={moveComments}
                onChange={(e) => setMoveComments(e.target.value)}
                className="min-h-[80px] resize-none text-sm font-sans"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setMovePending(null); setMoveComments(''); }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!movePending) return;
                  updateStatus.mutate({
                    appId: movePending.app.id,
                    status: movePending.targetStatus,
                    candidateId: movePending.app.candidate_id,
                    recruiter_notes: moveComments.trim() || undefined,
                  });
                  setMovePending(null);
                  setMoveComments('');
                }}
              >
                Move to {movePending.targetLabel}
              </Button>
            </div>
          </div>
        )}
      </PipelineModal>
    </DashboardLayout >
  );
}
