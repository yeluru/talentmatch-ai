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
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  iconColor = 'text-primary',
  className,
  href,
  onClick
}: StatCardProps) {
  const content = (
    <div className="relative z-10">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold font-display tracking-tight text-foreground">{value}</p>
          {change && (
            <p className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full inline-block",
              changeType === 'positive' && "bg-emerald-500/10 text-emerald-500",
              changeType === 'negative' && "bg-rose-500/10 text-rose-500",
              changeType === 'neutral' && "bg-muted text-muted-foreground"
            )}>
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300",
            "bg-primary/10",
            iconColor
          )}>
            <Icon className="h-5 w-5 text-current" />
          </div>
        )}
      </div>
    </div>
  );

  const cardClasses = cn(
    "glass-panel p-6 relative overflow-hidden group hover-card-premium transition-all duration-300 rounded-xl",
    (href || onClick) && "cursor-pointer",
    className
  );

  if (href) {
    return (
      <Link to={href} className={cardClasses} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClasses} onClick={onClick}>
      {content}
    </div>
  );
}