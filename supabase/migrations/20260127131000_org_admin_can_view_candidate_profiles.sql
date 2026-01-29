-- Allow org admins to view candidate user profiles linked to their org.
-- Without this, Org Admin "All Users" shows candidates as "Candidate" because profiles RLS blocks access.

DROP POLICY IF EXISTS "Org admins can view candidate profiles via links" ON public.profiles;
CREATE POLICY "Org admins can view candidate profiles via links"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_profiles cp
    JOIN public.candidate_org_links col
      ON col.candidate_id = cp.id
    WHERE cp.user_id = public.profiles.user_id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);

