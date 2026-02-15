-- Allow super admins to view all audit logs across all organizations
-- This is critical for platform-level troubleshooting and compliance

-- Drop existing policy if it exists (shouldn't, but just in case)
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;

-- Create policy for super admin to view ALL audit logs
CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin')
);

COMMENT ON POLICY "Super admins can view all audit logs" ON public.audit_logs IS
  'Platform admins can view audit logs across all organizations for troubleshooting and compliance';
