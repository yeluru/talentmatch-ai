-- Recruiters see only their own sourced candidates + applicants to jobs they own or are assigned to.
-- AM/org_admin continue to see all org candidates in the talent pool.

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
      AND ur.role IN ('recruiter'::app_role, 'account_manager'::app_role)
    LIMIT 1
  ),
  sourced AS (
    SELECT col.candidate_id
    FROM public.candidate_org_links col
    INNER JOIN my_org o ON o.organization_id = col.organization_id
    WHERE col.status = 'active'
      AND col.link_type IN (
        'resume_upload', 'web_search', 'google_xray', 'linkedin_search',
        'sourced_resume', 'sourced_web', 'sourced', 'unknown', 'application'
      )
      AND (
        has_role(auth.uid(), 'account_manager'::app_role)
        OR has_role(auth.uid(), 'org_admin'::app_role)
        OR col.created_by = auth.uid()
      )
  ),
  -- Applicants: candidate belongs to job owner. Recruiter sees only applicants to jobs they own (not assigned).
  applicants AS (
    SELECT a.candidate_id
    FROM public.applications a
    INNER JOIN public.jobs j ON j.id = a.job_id
    INNER JOIN my_org o ON o.organization_id = j.organization_id
    WHERE has_role(auth.uid(), 'account_manager'::app_role)
       OR has_role(auth.uid(), 'org_admin'::app_role)
       OR j.recruiter_id = auth.uid()
  )
  SELECT DISTINCT candidate_id FROM sourced
  UNION
  SELECT DISTINCT candidate_id FROM applicants;
$$;
