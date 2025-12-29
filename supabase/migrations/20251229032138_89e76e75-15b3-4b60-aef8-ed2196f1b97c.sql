-- ============================================
-- SECURITY FIX: Restrict data access to organization scope
-- ============================================

-- 1. Fix privilege escalation in user_roles
-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert their own roles" ON public.user_roles;

-- Create a restrictive policy: users can only insert candidate role for themselves
-- Recruiter/manager roles must be assigned through proper onboarding flow
CREATE POLICY "Users can only self-assign candidate role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'candidate'::app_role
);

-- 2. Create helper function to check if recruiter can access a candidate
CREATE OR REPLACE FUNCTION public.recruiter_can_access_candidate(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Candidate is in recruiter's org talent pool
    SELECT 1 FROM candidate_profiles cp
    WHERE cp.id = _candidate_id 
      AND cp.organization_id = get_user_organization(auth.uid())
  )
  OR EXISTS (
    -- Candidate applied to recruiter's org jobs
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = _candidate_id
      AND j.organization_id = get_user_organization(auth.uid())
  )
  OR EXISTS (
    -- Candidate is in recruiter's org shortlists
    SELECT 1 FROM shortlist_candidates sc
    JOIN candidate_shortlists cs ON cs.id = sc.shortlist_id
    WHERE sc.candidate_id = _candidate_id
      AND cs.organization_id = get_user_organization(auth.uid())
  )
$$;

-- 3. Fix profiles table - restrict recruiter access
DROP POLICY IF EXISTS "Recruiters can view all profiles for talent search" ON public.profiles;
DROP POLICY IF EXISTS "Recruiters can view profiles of applicants" ON public.profiles;

CREATE POLICY "Recruiters can view profiles of accessible candidates"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    has_role(auth.uid(), 'recruiter'::app_role) 
    AND user_id IN (
      SELECT cp.user_id FROM candidate_profiles cp
      WHERE recruiter_can_access_candidate(cp.id)
    )
  )
);

-- 4. Fix candidate_profiles table - restrict to org scope
DROP POLICY IF EXISTS "Recruiters can view candidate profiles" ON public.candidate_profiles;
DROP POLICY IF EXISTS "Recruiters can view sourced profiles in org" ON public.candidate_profiles;

CREATE POLICY "Recruiters can view accessible candidates"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    has_role(auth.uid(), 'recruiter'::app_role) 
    AND recruiter_can_access_candidate(id)
  )
);

-- 5. Fix resumes table - restrict to accessible candidates
DROP POLICY IF EXISTS "Recruiters can view resumes of applicants" ON public.resumes;

CREATE POLICY "Recruiters can view resumes of accessible candidates"
ON public.resumes
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 6. Fix candidate_skills table
DROP POLICY IF EXISTS "Recruiters can view skills of applicants" ON public.candidate_skills;

CREATE POLICY "Recruiters can view skills of accessible candidates"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 7. Fix candidate_experience table
DROP POLICY IF EXISTS "Recruiters can view experience of applicants" ON public.candidate_experience;

CREATE POLICY "Recruiters can view experience of accessible candidates"
ON public.candidate_experience
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 8. Fix candidate_education table
DROP POLICY IF EXISTS "Recruiters can view education of applicants" ON public.candidate_education;

CREATE POLICY "Recruiters can view education of accessible candidates"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);