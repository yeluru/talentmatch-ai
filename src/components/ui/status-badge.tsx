import { cn } from '@/lib/utils';

export type ApplicationStatus =
  | 'outreach'
  | 'applied'
  | 'rtr_rate'
  | 'document_check'
  | 'screening'
  | 'submission'
  | 'final_update';

export type StatusVariant = 'default' | 'info' | 'warning' | 'success' | 'destructive';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
  /** When status is final_update, optional outcome to show (e.g. "Client rejected"). */
  outcome?: string | null;
}

/** 'new' = no engagement yet (e.g. just added to pool); shown as "New" until recruiter starts engagement. */
const statusConfig: Record<ApplicationStatus | 'new', { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-muted/80 text-muted-foreground border-border' },
  outreach: { label: 'Engaged', className: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700' },
  applied: { label: 'Applied', className: 'stage-applied' },
  rtr_rate: { label: 'RTR & rate', className: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
  document_check: { label: 'Doc check', className: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800' },
  screening: { label: 'Screening', className: 'stage-screening' },
  submission: { label: 'Submission', className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' },
  final_update: { label: 'Outcome', className: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-800' },
};

const variantConfig: Record<StatusVariant, string> = {
  default: 'bg-muted border-muted',
  info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
  success: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  destructive: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
};

/** Map status for display. Keep 'new' as New (empty stage); only outreach = Engaged after recruiter starts engagement. */
function normalizeStatus(status: string): ApplicationStatus | 'new' | string {
  const s = String(status || '').trim().toLowerCase();
  if (!s || s === 'new') return 'new';
  if (s === 'contacted') return 'outreach';
  if (s === 'interviewing' || s === 'client_interview' || s === 'client_shortlist' || s === 'offered' || s === 'hired' || s === 'rejected' || s === 'withdrawn') return 'final_update';
  return status;
}

export function StatusBadge({ status, variant, className, outcome }: StatusBadgeProps) {
  if (variant) {
    return (
      <span className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variantConfig[variant],
        className
      )}>
        {status}
      </span>
    );
  }

  const normalized = normalizeStatus(status);
  const config = statusConfig[normalized as ApplicationStatus | 'new'] || { label: String(normalized).replace(/_/g, ' '), className: 'bg-muted border-muted' };
  const displayLabel = (normalized === 'final_update' && outcome?.trim()) ? outcome.trim() : config.label;

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      config.className,
      className
    )}>
      {displayLabel}
    </span>
  );
}
