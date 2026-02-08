-- Fix "new row violates row level security" when starting engagement (e.g. recruiter who switched from AM).
-- 1) Trigger that ensures application for engagement: run as DEFINER so it can always insert (bypasses RLS).
-- 2) Applications UPDATE: allow account_manager and org_admin (not just recruiter) so staff can upsert.

-- 1) ensure_application_for_engagement: SECURITY DEFINER so trigger insert is not blocked by RLS
CREATE OR REPLACE FUNCTION public.ensure_application_for_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    VALUES (NEW.job_id, NEW.candidate_id, 'outreach', COALESCE(NEW.created_at, now()))
    ON CONFLICT (job_id, candidate_id) DO UPDATE SET
      status = 'outreach',
      applied_at = COALESCE(EXCLUDED.applied_at, now());
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Applications UPDATE: allow all staff (recruiter, account_manager, org_admin) for org jobs
DROP POLICY IF EXISTS "Recruiters can update applications for their organization jobs" ON public.applications;

CREATE POLICY "Staff can update applications for their organization jobs"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);
