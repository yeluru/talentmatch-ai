-- Allow recruiters to delete sourced candidates from their organization
-- Frontend has comprehensive safety checks to prevent bad deletes

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Recruiters can delete sourced candidates in their org" ON candidate_profiles;

-- Create policy allowing recruiters to delete candidates
CREATE POLICY "Recruiters can delete sourced candidates in their org"
ON candidate_profiles
FOR DELETE
TO authenticated
USING (
  -- User must be a recruiter/account_manager/org_admin
  EXISTS (
    SELECT 1
    FROM user_roles ur
    INNER JOIN candidate_org_links col ON col.organization_id = ur.organization_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('recruiter', 'account_manager', 'org_admin')
      AND col.candidate_id = candidate_profiles.id
      AND col.status = 'active'
  )
  -- Additional safety: only sourced candidates (no user_id)
  AND candidate_profiles.user_id IS NULL
);

COMMENT ON POLICY "Recruiters can delete sourced candidates in their org" ON candidate_profiles
IS 'Allows recruiters to delete sourced candidates linked to their organization. Frontend validates safety checks.';
