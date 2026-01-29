import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
  href?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  iconColor = 'text-accent',
  className,
  href,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold font-display tracking-tight">{value}</p>
          {change && (
            <p className={cn(
              "text-sm font-medium",
              changeType === 'positive' && 'text-success',
              changeType === 'negative' && 'text-destructive',
              changeType === 'neutral' && ''
            )}>
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center",
            iconColor,
          )}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      
      {/* Decorative gradient */}
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
    </>
  );

  const cardClasses = cn(
    "relative overflow-hidden rounded-2xl border bg-card p-6 card-interactive",
    href && "cursor-pointer hover:border-accent/50 transition-colors",
    className
  );

  if (href) {
    return (
      <Link to={href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClasses}>
      {content}
    </div>
  );
}