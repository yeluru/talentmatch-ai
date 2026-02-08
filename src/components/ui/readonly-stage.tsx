import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { STAGE_READONLY_MESSAGE } from '@/lib/statusOptions';
import { cn } from '@/lib/utils';

interface ReadOnlyStageProps {
  status: string | null | undefined;
  outcome?: string | null;
  className?: string;
  triggerClassName?: string;
}

/** Displays pipeline stage as readonly (e.g. in Talent Pool). Click shows message that stages are managed in the Pipeline. */
export function ReadOnlyStage({ status, outcome, className, triggerClassName }: ReadOnlyStageProps) {
  const value = (status || 'outreach').trim() || 'outreach';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast.info(STAGE_READONLY_MESSAGE);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toast.info(STAGE_READONLY_MESSAGE);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={STAGE_READONLY_MESSAGE}
      className={cn(
        'flex h-8 min-w-0 max-w-[140px] items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs cursor-default ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        triggerClassName,
        className
      )}
      aria-label={`Stage: ${value}. ${STAGE_READONLY_MESSAGE}`}
    >
      <StatusBadge status={value} outcome={outcome} />
    </div>
  );
}
