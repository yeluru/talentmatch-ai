import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ScoreBadge({ score, size = 'md', showLabel = true, className }: ScoreBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-fair';
    return 'score-poor';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Low';
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold',
        getScoreColor(score),
        sizeClasses[size]
      )}>
        {score}%
      </span>
      {showLabel && (
        <span className="text-sm">
          {getScoreLabel(score)}
        </span>
      )}
    </div>
  );
}