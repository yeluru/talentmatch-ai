import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('candidate' | 'recruiter' | 'account_manager' | 'org_admin' | 'super_admin')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, currentRole, isLoading, isSuperAdmin, profile, signOut } = useAuth();
  const location = useLocation();
  const [hasHydrated, setHasHydrated] = useState(false);

  // Track when auth has hydrated - after first load, never show loading screen again
  useEffect(() => {
    if (!isLoading && !hasHydrated) {
      setHasHydrated(true);
    }
  }, [isLoading, hasHydrated]);

  // CRITICAL: After first hydration, NEVER unmount children (preserves form state)
  // Only show loading screen on initial load, not on token refreshes/tab switches
  if (isLoading && !hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="">Loading...</p>
        </div>
      </div>
    );
  }

  // Signed in but role couldn't be determined (avoid infinite spinner)
  if (user && allowedRoles && !currentRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">We couldn’t load your access</h1>
          <p className="mt-2 text-sm">
            Your session is active, but your role/permissions couldn’t be loaded. Try signing out and signing in again. If you believe you should have access, contact your administrator.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={() => (window.location.href = '/auth')}
            >
              Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Soft-disable: suspended users cannot access the app (reversible by platform admin).
  if ((profile as any)?.is_suspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Account suspended</h1>
          <p className="mt-2 text-sm">
            Your account has been suspended. Please contact support if you believe this is a mistake.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={async () => {
                await signOut();
                window.location.href = '/auth';
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    // Super admins can access their dashboard
    if (isSuperAdmin && allowedRoles.includes('super_admin')) {
      return <>{children}</>;
    }
    
    const redirectPath = currentRole === 'super_admin'
      ? '/admin'
      : currentRole === 'org_admin'
      ? '/org-admin'
      : currentRole === 'candidate' 
      ? '/candidate' 
      : currentRole === 'recruiter' 
      ? '/recruiter' 
      : '/manager';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
