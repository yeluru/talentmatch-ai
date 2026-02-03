-- Ensure account managers can view all user_roles in their org (My Team page).
-- This may already be granted by "Managers can view org user roles"; adding an explicit
-- policy so prod environments where that policy is missing or different still work.

DROP POLICY IF EXISTS "Account managers can view org user roles" ON public.user_roles;
CREATE POLICY "Account managers can view org user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);
