-- Update jobs SELECT policy to allow public (unauthenticated) access to published jobs
DROP POLICY IF EXISTS "Users can view published jobs and org jobs" ON public.jobs;

-- Allow anyone (including unauthenticated) to view published jobs
-- Authenticated users in the same org can see all jobs (any status)
CREATE POLICY "Public can view published jobs" 
ON public.jobs 
FOR SELECT 
USING (
  -- Anyone can see published jobs (no auth required)
  (status = 'published')
  OR
  -- Authenticated recruiters/managers can see all jobs in their organization
  (auth.uid() IS NOT NULL AND organization_id = get_user_organization(auth.uid()))
);

-- Also need to allow public access to organizations for job display
DROP POLICY IF EXISTS "Public can view organizations" ON public.organizations;

CREATE POLICY "Public can view organizations" 
ON public.organizations 
FOR SELECT 
USING (true);