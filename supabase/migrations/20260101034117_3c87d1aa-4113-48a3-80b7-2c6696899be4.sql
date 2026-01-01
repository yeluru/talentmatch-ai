-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view organizations" ON public.organizations;

-- Only expose orgs that have at least one published job (for job listings)
CREATE POLICY "Public can view organizations with published jobs"
ON public.organizations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.organization_id = organizations.id 
    AND jobs.status = 'published'
  )
);