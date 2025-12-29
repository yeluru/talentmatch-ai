import { cn } from '@/lib/utils';

export type ApplicationStatus = 'applied' | 'reviewing' | 'reviewed' | 'shortlisted' | 'interviewing' | 'offered' | 'hired' | 'rejected' | 'withdrawn';

export type StatusVariant = 'default' | 'info' | 'warning' | 'success' | 'destructive';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
}

const statusConfig: Record<ApplicationStatus, { label: string; className: string }> = {
  applied: { label: 'Applied', className: 'stage-applied' },
  reviewing: { label: 'Reviewing', className: 'stage-reviewed' },
  reviewed: { label: 'Reviewed', className: 'stage-reviewed' },
  shortlisted: { label: 'Shortlisted', className: 'stage-shortlisted' },
  interviewing: { label: 'Interviewing', className: 'stage-interviewing' },
  offered: { label: 'Offered', className: 'stage-offered' },
  hired: { label: 'Hired', className: 'stage-hired' },
  rejected: { label: 'Rejected', className: 'stage-rejected' },
  withdrawn: { label: 'Withdrawn', className: 'bg-muted text-muted-foreground border-muted' },
};

const variantConfig: Record<StatusVariant, string> = {
  default: 'bg-muted text-muted-foreground border-muted',
  info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
  success: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  destructive: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
};

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  // If variant is provided, use variant-based styling
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

  // Otherwise use the legacy ApplicationStatus-based styling
  const config = statusConfig[status as ApplicationStatus] || { label: status, className: 'bg-muted text-muted-foreground border-muted' };
  
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}