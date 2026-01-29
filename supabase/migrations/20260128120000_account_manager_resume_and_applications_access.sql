-- Account Manager: same access as recruiter for org candidates' resumes and applications
-- Fixes: (1) AM sees same profile count as recruiter (applications SELECT), (2) AM sees resume link in drawer (resumes table + storage)

-- 1) Applications: allow account_manager to view applications for their org's jobs (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view applications for their organization jobs" ON public.applications;
CREATE POLICY "Staff can view applications for their organization jobs"
ON public.applications
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);

-- 2) Resumes table: allow account_manager to view resumes of org-accessible candidates (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view resumes of accessible candidates" ON public.resumes;
CREATE POLICY "Staff can view resumes of accessible candidates"
ON public.resumes
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

-- 3) Storage: allow account_manager to view sourced resumes (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view sourced resumes" ON storage.objects;
CREATE POLICY "Staff can view sourced resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
);

-- 4) Storage: allow account_manager to view accessible candidate resumes (user_id-based paths)
DROP POLICY IF EXISTS "Recruiters can view accessible candidate resumes" ON storage.objects;
CREATE POLICY "Staff can view accessible candidate resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND (
    (storage.foldername(name))[1]::uuid IN (
      SELECT cp.user_id FROM public.candidate_profiles cp
      WHERE public.recruiter_can_access_candidate(cp.id) AND cp.user_id IS NOT NULL
    )
  )
);
