-- Make user_id nullable for imported/sourced profiles
ALTER TABLE public.candidate_profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add RLS policy for recruiters to insert sourced profiles (where user_id is null)
CREATE POLICY "Recruiters can insert sourced profiles"
ON public.candidate_profiles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IS NULL 
  AND organization_id = get_user_organization(auth.uid())
);

-- Add RLS policy for recruiters to view sourced profiles in their org
CREATE POLICY "Recruiters can view sourced profiles in org"
ON public.candidate_profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IS NULL 
  AND organization_id = get_user_organization(auth.uid())
);