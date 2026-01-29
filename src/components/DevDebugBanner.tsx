import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function DevDebugBanner() {
  // Only in dev/preview
  if (!import.meta.env.DEV) return null;

  const location = useLocation();
  const { user, isLoading, currentRole, roles, organizationId } = useAuth();

  const items: Array<[string, string]> = [
    ["path", location.pathname],
    ["authLoading", String(isLoading)],
    ["user", user ? "yes" : "no"],
    ["currentRole", currentRole ?? "null"],
    ["roles", String(roles?.length ?? 0)],
    ["orgId", organizationId ? "set" : "null"],
  ];

  return (
    <div className="fixed bottom-3 left-3 z-[100] w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border bg-card/90 backdrop-blur px-3 py-2 text-xs text-foreground shadow-sm overflow-hidden">
      <div className="font-medium mb-1">Debug</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <div className="">{k}:</div>
            <div className="font-mono truncate">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
