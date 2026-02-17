import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface LoadingProgressBarProps {
  loaded: number;
  total: number;
  message?: string;
}

export function LoadingProgressBar({ loaded, total, message }: LoadingProgressBarProps) {
  const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="bg-muted/50 border-b border-white/10 px-6 py-3">
      <div className="flex items-center gap-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">
              {message || 'Loading talent pool'}
            </span>
            <span className="text-sm text-muted-foreground">
              {loaded.toLocaleString()} of {total.toLocaleString()} profiles
            </span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {percentage}%
        </span>
      </div>
    </div>
  );
}
