-- Fix organizations INSERT policy (change from RESTRICTIVE to PERMISSIVE)
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;
CREATE POLICY "Anyone can create organizations" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Fix candidate_profiles policies
DROP POLICY IF EXISTS "Candidates can manage their own profile" ON public.candidate_profiles;

-- Create separate policies for each operation to avoid issues
CREATE POLICY "Candidates can view their own profile"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Candidates can insert their own profile"
ON public.candidate_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Candidates can update their own profile"
ON public.candidate_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Candidates can delete their own profile"
ON public.candidate_profiles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Keep recruiter view policy but ensure it's permissive
DROP POLICY IF EXISTS "Recruiters can view candidate profiles for their job applicants" ON public.candidate_profiles;
CREATE POLICY "Recruiters can view candidate profiles"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  OR auth.uid() = user_id
);