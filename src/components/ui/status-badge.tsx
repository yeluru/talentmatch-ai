import { cn } from '@/lib/utils';

export type ApplicationStatus = 'applied' | 'reviewing' | 'reviewed' | 'shortlisted' | 'interviewing' | 'offered' | 'hired' | 'rejected' | 'withdrawn';

interface StatusBadgeProps {
  status: ApplicationStatus;
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

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.applied;
  
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