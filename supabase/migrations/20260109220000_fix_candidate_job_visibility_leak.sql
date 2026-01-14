-- Fix: candidates seeing tenant-private jobs.
-- Root cause:
-- - get_user_organization(user_id) returned organization_id from ANY role row (LIMIT 1),
--   which could erroneously give candidates an org context.
-- - jobs SELECT policy granted org-wide job visibility to any authenticated user if
--   organization_id = get_user_organization(auth.uid()).
--
-- Correct behavior:
-- - Only staff roles (recruiter/account_manager/org_admin/super_admin) should ever receive
--   org-wide job visibility from get_user_organization().
-- - Candidates should see:
--   - public published jobs
--   - private published jobs ONLY when linked via candidate_org_links.

-- 1) Make get_user_organization() ignore candidate role rows.
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.organization_id
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.organization_id IS NOT NULL
    AND ur.role <> 'candidate'::app_role
  LIMIT 1
$$;

-- 2) Tighten jobs SELECT policy: org-wide access only for staff roles.
DO $$
BEGIN
  -- Policy was introduced in 20260109000000_marketplace_jobs_visibility_and_candidate_links.sql
  DROP POLICY IF EXISTS "Jobs visibility rules" ON public.jobs;
END $$;

CREATE POLICY "Jobs visibility rules"
ON public.jobs
FOR SELECT
USING (
  (
    status = 'published'
    AND visibility = 'public'
  )
  OR (
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'recruiter'::app_role)
      OR has_role(auth.uid(), 'account_manager'::app_role)
      OR has_role(auth.uid(), 'org_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND organization_id = get_user_organization(auth.uid())
  )
  OR (
    auth.uid() IS NOT NULL
    AND status = 'published'
    AND visibility = 'private'
    AND has_role(auth.uid(), 'candidate'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.candidate_org_ids_for_user(auth.uid()) org_id
      WHERE org_id = public.jobs.organization_id
    )
  )
);

