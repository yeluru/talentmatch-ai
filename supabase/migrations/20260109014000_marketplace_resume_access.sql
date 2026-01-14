-- Allow recruiters to view resumes for marketplace-discoverable candidates (read-only).

-- Update public.resumes SELECT policy to include marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view resumes of accessible candidates" ON public.resumes;

CREATE POLICY "Recruiters can view resumes of accessible candidates"
ON public.resumes
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

