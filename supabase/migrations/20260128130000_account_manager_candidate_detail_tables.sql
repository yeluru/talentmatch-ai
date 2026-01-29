-- Allow account_manager to view candidate skills, experience, and education in the detail drawer
-- (same as recruiter: org-accessible + marketplace when enabled).
-- Without this, AM only sees summary, status, and resume in TalentDetailSheet.

-- candidate_skills: staff (recruiter or account_manager) can view skills for org + marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view candidate skills (org + marketplace)" ON public.candidate_skills;
CREATE POLICY "Staff can view candidate skills (org + marketplace)"
ON public.candidate_skills
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

-- candidate_experience: staff can view experience for org + marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view candidate experience (org + marketplace)" ON public.candidate_experience;
CREATE POLICY "Staff can view candidate experience (org + marketplace)"
ON public.candidate_experience
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

-- candidate_education: staff can view education for org-accessible candidates
DROP POLICY IF EXISTS "Recruiters can view education of accessible candidates" ON public.candidate_education;
CREATE POLICY "Staff can view education of accessible candidates"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND public.recruiter_can_access_candidate(candidate_id)
  )
);
