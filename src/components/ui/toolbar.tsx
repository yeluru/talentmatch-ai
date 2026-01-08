import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Toolbar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  if (!left && !right) return null;
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-center md:justify-between", className)}>
      <div className="min-w-0">{left}</div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

