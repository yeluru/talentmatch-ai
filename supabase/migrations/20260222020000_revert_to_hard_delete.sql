-- Revert to hard delete: remove soft delete column and restore original RPC
-- Hard delete is simpler and better for this use case with comprehensive safety checks

-- Drop the deleted_at column (no longer needed)
ALTER TABLE candidate_profiles
DROP COLUMN IF EXISTS deleted_at;

-- Restore original get_talent_pool_candidate_ids (no deleted_at filter needed)
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

-- Restore original check_duplicate_resume (no deleted_at filter needed)
CREATE OR REPLACE FUNCTION check_duplicate_resume(
  p_content_hash TEXT,
  p_organization_id UUID
)
RETURNS TABLE (
  candidate_id UUID,
  candidate_name TEXT,
  resume_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id as candidate_id,
    cp.full_name as candidate_name,
    r.id as resume_id
  FROM candidate_profiles cp
  JOIN resumes r ON r.candidate_id = cp.id
  JOIN candidate_org_links col ON col.candidate_id = cp.id
  WHERE r.content_hash = p_content_hash
    AND col.organization_id = p_organization_id
    AND col.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_talent_pool_candidate_ids IS 'Returns candidate IDs for talent pool (hard delete - no soft delete filtering needed)';
COMMENT ON FUNCTION check_duplicate_resume IS 'Check for duplicate resume by content hash (hard delete - deleted candidates are gone)';
