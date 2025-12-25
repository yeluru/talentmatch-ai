import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  iconColor = 'text-accent',
  className,
}: StatCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-card p-6 card-interactive",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold font-display tracking-tight">{value}</p>
          {change && (
            <p className={cn(
              "text-sm font-medium",
              changeType === 'positive' && 'text-success',
              changeType === 'negative' && 'text-destructive',
              changeType === 'neutral' && 'text-muted-foreground'
            )}>
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center",
            iconColor
          )}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      
      {/* Decorative gradient */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-accent/5 blur-2xl" />
    </div>
  );
}