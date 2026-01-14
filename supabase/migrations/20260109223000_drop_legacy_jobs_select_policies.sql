-- Ensure only one SELECT policy governs job visibility.
-- Postgres ORs SELECT policies; if any legacy permissive policy remains,
-- candidates may see tenant-private jobs.

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Legacy policies from earlier iterations
  DROP POLICY IF EXISTS "Published jobs are viewable by all authenticated users" ON public.jobs;
  DROP POLICY IF EXISTS "Users can view jobs from their organization" ON public.jobs;
  DROP POLICY IF EXISTS "Users can view published jobs and org jobs" ON public.jobs;
  DROP POLICY IF EXISTS "Public can view published jobs" ON public.jobs;

  -- Current policy names from marketplace iteration
  DROP POLICY IF EXISTS "Jobs visibility rules" ON public.jobs;
END $$;

-- Recreate the single source of truth policy
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

