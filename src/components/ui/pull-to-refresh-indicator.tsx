import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
  className?: string;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 70,
  className,
}: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const progress = Math.min(1, pullDistance / threshold);
  const isReady = pullDistance >= threshold;

  return (
    <div
      className={cn(
        "fixed left-0 right-0 top-16 z-50 pointer-events-none",
        className
      )}
      aria-hidden="true"
    >
      <div
        className="mx-auto w-full max-w-md px-4 transition-all duration-150"
        style={{ height: Math.min(80, Math.max(36, pullDistance)) }}
      >
        <div className="h-full w-full rounded-b-2xl bg-card/95 backdrop-blur-sm border border-border shadow-md flex items-center justify-center gap-2">
          <div
            className={cn(
              "transition-transform duration-200",
              isReady && !isRefreshing && "scale-110"
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${progress * 180}deg)`,
            }}
          >
            <Loader2
              className={cn(
                "h-5 w-5",
                isRefreshing ? "animate-spin text-primary" : ""
              )}
            />
          </div>
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              isReady || isRefreshing ? "text-primary" : ""
            )}
          >
            {isRefreshing
              ? "Refreshing…"
              : isReady
              ? "Release to refresh"
              : "Pull to refresh"}
          </span>
        </div>
      </div>
    </div>
  );
}
