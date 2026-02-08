-- Allow account managers to update recruiter_notes on candidate_profiles for org-accessible
-- candidates so they can add/edit comments when viewing a recruiter's pipeline (they still cannot move candidates).

DROP POLICY IF EXISTS "Account managers can update candidate notes for org candidates" ON public.candidate_profiles;

CREATE POLICY "Account managers can update candidate notes for org candidates"
ON public.candidate_profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND public.recruiter_can_access_candidate(id)
)
WITH CHECK (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND public.recruiter_can_access_candidate(id)
);
