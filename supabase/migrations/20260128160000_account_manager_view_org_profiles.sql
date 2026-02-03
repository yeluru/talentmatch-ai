-- Account managers: allow viewing profiles of all org members (My Team page).
-- Uses a SECURITY DEFINER function so the profile check does not depend on RLS
-- when evaluating the user_roles subquery (avoids prod visibility issues).

CREATE OR REPLACE FUNCTION public.get_org_member_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.organization_id = get_user_organization(auth.uid())
    AND ur.organization_id IS NOT NULL;
$$;

-- Allow account managers to read profiles of everyone in their org (team list).
DROP POLICY IF EXISTS "Account managers can view org member profiles" ON public.profiles;
CREATE POLICY "Account managers can view org member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND user_id IN (SELECT public.get_org_member_user_ids())
);
