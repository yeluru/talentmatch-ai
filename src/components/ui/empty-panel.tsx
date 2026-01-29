import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function EmptyPanel({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}) {
  return (
    <div className={cn("card-elevated border-dashed border-2 p-8", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        {icon ? <div className="mb-4">{icon}</div> : null}
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {description ? <p className="mt-2 text-sm">{description}</p> : null}
        {action ? (
          <div className="mt-5">
            {action.href ? (
              <Button asChild className="btn-glow">
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : (
              <Button onClick={action.onClick} className="btn-glow">
                {action.label}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

