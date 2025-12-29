import { ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";

interface AppInitGateProps {
  children: ReactNode;
}

/**
 * Shows a lightweight branded loading screen while the auth session + profile/roles are initializing.
 */
export function AppInitGate({ children }: AppInitGateProps) {
  const { isLoading } = useAuth();

  // Avoid flicker for very fast loads
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const t = window.setTimeout(() => setShow(true), 150);
      return () => window.clearTimeout(t);
    }
    setShow(false);
  }, [isLoading]);

  if (!isLoading || !show) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border bg-card shadow-sm p-8">
            <div className="flex flex-col items-center text-center">
              <img
                src={logo}
                alt="TalentMatch AI"
                className="h-12 w-auto"
                loading="eager"
              />
              <div className="mt-6 w-full">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-1/2 bg-accent animate-pulse" />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Preparing your workspace…</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Tip: first load may take a moment.
          </p>
        </div>
      </div>
    </div>
  );
}
