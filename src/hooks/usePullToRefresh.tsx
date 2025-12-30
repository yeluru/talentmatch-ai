import * as React from "react";

interface UsePullToRefreshOptions {
  enabled?: boolean;
  threshold?: number;
  maxPull?: number;
  onRefresh: () => Promise<unknown> | unknown;
}

export function usePullToRefresh({
  enabled = true,
  threshold = 70,
  maxPull = 110,
  onRefresh,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const startYRef = React.useRef(0);
  const trackingRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (e.touches.length !== 1) return;

      const atTop = window.scrollY <= 0;
      if (!atTop) return;

      trackingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      setPullDistance(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      if (e.touches.length !== 1) return;

      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }

      // Apply a little resistance so it feels more native.
      const resisted = dy * 0.7;
      setPullDistance(Math.min(maxPull, resisted));
    };

    const onTouchEnd = async () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      const shouldRefresh = pullDistance >= threshold;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      try {
        setRefreshing(true);
        // Keep the indicator visible while refreshing
        setPullDistance(Math.min(maxPull, threshold));
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshing, threshold, maxPull, onRefresh, pullDistance]);

  return {
    pullDistance,
    refreshing,
    isPulling: pullDistance > 0,
  };
}
