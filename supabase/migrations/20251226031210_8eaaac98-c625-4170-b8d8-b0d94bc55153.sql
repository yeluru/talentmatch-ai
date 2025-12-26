-- Update jobs SELECT policy to allow candidates to see all published jobs
DROP POLICY IF EXISTS "Users can view jobs from their organization" ON public.jobs;

-- Candidates can see all published jobs
-- Recruiters/managers can see all jobs from their organization (any status)
CREATE POLICY "Users can view published jobs and org jobs" 
ON public.jobs 
FOR SELECT 
TO authenticated
USING (
  -- Anyone can see published jobs
  (status = 'published')
  OR
  -- Recruiters/managers can see all jobs in their organization
  (organization_id = get_user_organization(auth.uid()))
);