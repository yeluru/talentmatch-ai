// Recruiter pipeline: Applied/Engaged → RTR → Document check → Screening → Submission → Outcome.
// After Submission, candidate is in Manager's pipeline. Recruiter records outcome in "Outcome" stage (final_update).

export type ApplicationStage =
  | 'outreach'
  | 'applied'
  | 'rtr_rate'
  | 'document_check'
  | 'screening'
  | 'submission'
  | 'final_update';

/** Outcome when status = final_update (recruiter records what manager said / what happened). */
export type FinalOutcome =
  | 'client_rejected'
  | 'job_offered'
  | 'candidate_declined'
  | 'withdrawn'
  | 'hired';

/** Ordered recruiter pipeline stages. Manager pipeline (future) starts at Submission. */
export const PIPELINE_STAGE_ORDER: ApplicationStage[] = [
  'outreach',
  'applied',
  'rtr_rate',
  'document_check',
  'screening',
  'submission',
  'final_update',
];

export const APPLICATION_STAGE_OPTIONS: { value: ApplicationStage; label: string }[] = [
  { value: 'outreach', label: 'Engaged' },
  { value: 'applied', label: 'Applied' },
  { value: 'rtr_rate', label: 'RTR & rate' },
  { value: 'document_check', label: 'Document check' },
  { value: 'screening', label: 'Screening' },
  { value: 'submission', label: 'Submission' },
  { value: 'final_update', label: 'Outcome' },
];

/** Talent Pool stage options: "New" (no engagement yet) + pipeline stages. New candidates show as New until recruiter starts engagement. */
export const TALENT_POOL_STAGE_OPTIONS: { value: 'new' | ApplicationStage; label: string }[] = [
  { value: 'new', label: 'New' },
  ...APPLICATION_STAGE_OPTIONS,
];

/** Options when moving a candidate to Outcome (final_update). */
export const FINAL_OUTCOME_OPTIONS: { value: FinalOutcome; label: string }[] = [
  { value: 'client_rejected', label: 'Client rejected' },
  { value: 'job_offered', label: 'Job offered' },
  { value: 'candidate_declined', label: 'Candidate declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'hired', label: 'Hired' },
];

/** Message when user tries to change stage outside the Pipeline (Talent Pool, etc.). */
export const STAGE_READONLY_MESSAGE =
  'Stages cannot be updated here. They are managed in the Pipeline.';

export function getFinalOutcomeLabel(outcome: string | null | undefined): string {
  const o = String(outcome || '').trim();
  const found = FINAL_OUTCOME_OPTIONS.find(opt => opt.value === o);
  return found ? found.label : (o || 'Outcome');
}

/** Display label for application status. Always maps to the 7 pipeline stages (same as pipeline UI).
 * Legacy/DB values are normalized via applicationStageColumnKey so only pipeline stage labels appear. */
export function getApplicationStatusLabel(status: string | null | undefined, outcome?: string | null): string {
  const s = String(status || '').trim();
  if (!s) return 'Applied';
  const canonical = applicationStageColumnKey(s) ?? (s as ApplicationStage);
  const stageOpt = APPLICATION_STAGE_OPTIONS.find(opt => opt.value === canonical);
  if (stageOpt) {
    if (canonical === 'final_update' && outcome) {
      const outcomeLabel = getFinalOutcomeLabel(outcome);
      if (outcomeLabel !== 'Outcome') return outcomeLabel;
    }
    return stageOpt.label;
  }
  return s.replace(/_/g, ' ');
}

/** Suggested actions per stage. */
export const PIPELINE_STAGE_ACTIONS: Record<ApplicationStage, string[]> = {
  outreach: ['Log contact', 'Mark contacted'],
  applied: ['Review application', 'Move to RTR & rate'],
  rtr_rate: ['Send RTR', 'Send rate confirmation', 'Capture response'],
  document_check: ['Request documents', 'Upload / verify', 'Mark verified'],
  screening: ['Send screening test', 'Schedule call', 'Record outcome'],
  submission: ['Submit to manager', 'Send to account manager'],
  final_update: ['Record outcome', 'Client rejected / Job offered / Candidate declined'],
};

export function applicationStageColumnKey(stage: string | null | undefined): ApplicationStage | null {
  const s = String(stage || '').trim();
  if (!s) return null;
  if (s === 'reviewed' || s === 'reviewing') return 'document_check';
  if (s === 'started') return 'outreach';
  if (s === 'rate_confirmation' || s === 'right_to_represent') return 'rtr_rate';
  if (s === 'shortlisted') return 'submission';
  if (s === 'interview' || s === 'interviewing') return 'final_update'; // legacy: map to outcome column
  if (s === 'offer' || s === 'offered') return 'final_update';
  if (s === 'onboarding') return 'final_update';
  if (s === 'closed' || s === 'rejected' || s === 'withdrawn' || s === 'hired') return 'final_update';
  if (s === 'client_shortlist' || s === 'client_interview') return 'final_update';
  return s as ApplicationStage;
}

/** All DB status values that map to this pipeline stage (for filtering: include legacy values). */
export function getStatusValuesForStage(stage: ApplicationStage): string[] {
  const byStage: Record<ApplicationStage, string[]> = {
    outreach: ['outreach', 'started'],
    applied: ['applied'],
    rtr_rate: ['rtr_rate', 'rate_confirmation', 'right_to_represent'],
    document_check: ['document_check', 'reviewing', 'reviewed'],
    screening: ['screening'],
    submission: ['submission', 'shortlisted'],
    final_update: [
      'final_update',
      'rejected',
      'withdrawn',
      'hired',
      'offered',
      'offer',
      'client_shortlist',
      'client_interview',
      'interviewing',
      'interview',
      'onboarding',
      'closed',
    ],
  };
  return byStage[stage] ?? [stage];
}

export type TalentPoolStatus =
  | 'new'
  | 'contacted'
  | 'screening'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

/** Legacy talent pool status options (deprecated). Use APPLICATION_STAGE_OPTIONS for consistency. */
export const TALENT_POOL_STATUS_OPTIONS: { value: TalentPoolStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'screening', label: 'Screening' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

/** Map recruiter_status to display stage. New/empty = "New" (no engagement yet). Engaged only when recruiter has started engagement (outreach). */
export function normalizeStatusForDisplay(status: string | null | undefined): 'new' | ApplicationStage | string {
  const s = String(status || '').trim().toLowerCase();
  if (!s || s === 'new') return 'new';
  if (s === 'contacted') return 'outreach';
  if (s === 'interviewing') return 'final_update';
  if (s === 'rejected' || s === 'withdrawn' || s === 'offered' || s === 'hired') return 'final_update';
  return s as ApplicationStage;
}