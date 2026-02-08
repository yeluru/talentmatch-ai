-- RPC: talent pool candidate IDs for current user's org (avoids RLS org mismatch).
-- Read-only; no existing tables or policies changed.

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
  ),
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

GRANT EXECUTE ON FUNCTION public.get_talent_pool_candidate_ids() TO authenticated;
