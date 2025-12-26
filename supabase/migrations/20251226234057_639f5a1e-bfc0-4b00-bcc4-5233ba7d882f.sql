-- Allow recruiters to view profiles of candidates who applied to their organization's jobs
CREATE POLICY "Recruiters can view profiles of applicants"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IN (
    SELECT cp.user_id 
    FROM candidate_profiles cp
    JOIN applications a ON a.candidate_id = cp.id
    JOIN jobs j ON j.id = a.job_id
    WHERE j.organization_id = get_user_organization(auth.uid())
  )
);