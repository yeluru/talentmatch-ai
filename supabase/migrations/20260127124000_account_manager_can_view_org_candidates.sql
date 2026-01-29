-- Allow account managers to view candidates linked to their org.
-- Needed for AM oversight views like Engagement Pipeline (candidate_profiles join).

DROP POLICY IF EXISTS "Account managers can view org candidates via links" ON public.candidate_profiles;
CREATE POLICY "Account managers can view org candidates via links"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = public.candidate_profiles.id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);

