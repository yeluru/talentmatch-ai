-- Add soft delete support to candidate_profiles
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for efficient filtering of non-deleted records
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_deleted_at
ON candidate_profiles(deleted_at)
WHERE deleted_at IS NULL;

-- Update duplicate detection function to ignore deleted candidates
-- When checking for duplicates, only consider records that are NOT deleted
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
    AND cp.deleted_at IS NULL  -- Ignore deleted candidates
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_duplicate_resume(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_duplicate_resume(TEXT, UUID) TO service_role;

COMMENT ON COLUMN candidate_profiles.deleted_at IS 'Soft delete timestamp. NULL means not deleted.';
