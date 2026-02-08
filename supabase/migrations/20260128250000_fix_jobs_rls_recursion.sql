-- Fix infinite recursion between jobs and job_recruiter_assignments RLS.
-- Cause: jobs SELECT policy checks EXISTS (SELECT from job_recruiter_assignments);
--        job_recruiter_assignments policy checks EXISTS (SELECT from jobs).
-- Fix: Use a SECURITY DEFINER function to resolve job organization without triggering jobs RLS.

-- 1) Function to get job's organization_id without going through jobs RLS (breaks cycle).
CREATE OR REPLACE FUNCTION public.job_organization_id(p_job_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.jobs WHERE id = p_job_id LIMIT 1;
$$;

-- 2) Replace job_recruiter_assignments policy so it does not SELECT from jobs (avoids recursion).
DROP POLICY IF EXISTS "AM and org admin can manage job recruiter assignments" ON public.job_recruiter_assignments;
CREATE POLICY "AM and org admin can manage job recruiter assignments"
ON public.job_recruiter_assignments
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND public.job_organization_id(job_id) = get_user_organization(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND public.job_organization_id(job_id) = get_user_organization(auth.uid())
);
