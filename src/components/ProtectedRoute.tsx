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
  if (isLoading || (user && allowedRoles && !currentRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-muted-foreground">Loading...</p>
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
