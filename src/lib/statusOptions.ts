// Shared status definitions.
//
// IMPORTANT: We intentionally keep these as two separate concepts:
// - Application stage (job-specific)
// - Talent Pool status (candidate-level / relationship)

export type ApplicationStage =
  | 'applied'
  | 'reviewing'
  | 'reviewed' // legacy/back-compat
  | 'screening'
  | 'shortlisted'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export const APPLICATION_STAGE_OPTIONS: { value: ApplicationStage; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export function applicationStageColumnKey(stage: string | null | undefined): ApplicationStage | null {
  const s = String(stage || '').trim();
  if (!s) return null;
  // Back-compat: older rows may use "reviewed" where UI uses "reviewing"
  if (s === 'reviewed') return 'reviewing';
  return (s as ApplicationStage);
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

