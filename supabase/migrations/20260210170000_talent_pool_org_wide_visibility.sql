-- Allow all recruiters in an organization to see all talent pool profiles (not just their own uploads)
-- This makes talent pool truly shared across the organization

CREATE OR REPLACE FUNCTION public.get_talent_pool_candidate_ids()
RETURNS TABLE(candidate_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_org AS (
    SELECT ur.organization_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id IS NOT NULL
      AND ur.role IN ('recruiter'::app_role, 'account_manager'::app_role, 'org_admin'::app_role)
    LIMIT 1
  ),
  sourced AS (
    -- All recruiters, account managers, and org admins see ALL sourced candidates in their organization
    SELECT col.candidate_id
    FROM public.candidate_org_links col
    INNER JOIN my_org o ON o.organization_id = col.organization_id
    WHERE col.status = 'active'
      AND col.link_type IN (
        'resume_upload', 'web_search', 'google_xray', 'linkedin_search',
        'sourced_resume', 'sourced_web', 'sourced', 'unknown', 'application'
      )
  ),
  -- Applicants: all staff see applicants to jobs in their organization
  applicants AS (
    SELECT a.candidate_id
    FROM public.applications a
    INNER JOIN public.jobs j ON j.id = a.job_id
    INNER JOIN my_org o ON o.organization_id = j.organization_id
  )
  SELECT DISTINCT candidate_id FROM sourced
  UNION
  SELECT DISTINCT candidate_id FROM applicants;
$$;
