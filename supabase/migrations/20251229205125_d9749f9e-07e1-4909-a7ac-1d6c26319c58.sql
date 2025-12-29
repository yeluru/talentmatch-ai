-- Fix #1: Secure the assign_user_role function to prevent privilege escalation
-- Only allow users to assign the 'candidate' role to themselves

CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _organization_id uuid DEFAULT NULL)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Only allow users to assign roles to themselves
  IF _user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign roles to other users';
  END IF;
  
  -- Only allow candidate role for self-assignment
  -- Recruiter and account_manager roles must be assigned through admin workflows
  IF _role != 'candidate'::app_role THEN
    RAISE EXCEPTION 'Only candidate role can be self-assigned. Contact admin for other roles.';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (_user_id, _role, _organization_id)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Fix #2: Secure the recruiter update policy to only allow updates to accessible candidates
-- Drop the overly permissive policy and create a properly scoped one

DROP POLICY IF EXISTS "Recruiters can update candidate notes and status" ON public.candidate_profiles;

CREATE POLICY "Recruiters can update accessible candidate notes"
ON public.candidate_profiles
FOR UPDATE
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND recruiter_can_access_candidate(id)
)
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND recruiter_can_access_candidate(id)
);