-- Allow tenant org admins to view audit logs for their own organization
DROP POLICY IF EXISTS "Org admins can view org audit logs" ON public.audit_logs;

CREATE POLICY "Org admins can view org audit logs"
ON public.audit_logs
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);


