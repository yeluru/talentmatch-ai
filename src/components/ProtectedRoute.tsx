import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('candidate' | 'recruiter' | 'account_manager' | 'super_admin')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, currentRole, isLoading, isSuperAdmin } = useAuth();
  const location = useLocation();

  // Initial auth/role hydration
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-muted-foreground">Loading...</p>
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
          <p className="mt-2 text-sm text-muted-foreground">
            Your session is active, but your role/permissions couldn’t be loaded. Please sign out and sign in again.
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

  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    // Super admins can access their dashboard
    if (isSuperAdmin && allowedRoles.includes('super_admin')) {
      return <>{children}</>;
    }
    
    const redirectPath = currentRole === 'super_admin'
      ? '/admin'
      : currentRole === 'candidate' 
      ? '/candidate' 
      : currentRole === 'recruiter' 
      ? '/recruiter' 
      : '/manager';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
