-- Backfill uploaded_by_user_id from audit_logs for existing candidates
-- This migration is SAFE and IDEMPOTENT:
-- - Only updates rows where uploaded_by_user_id IS NULL
-- - Can be run multiple times without issues
-- - Uses the earliest successful upload record per candidate

-- First, let's see how many records will be affected (for verification)
DO $$
DECLARE
  null_count INTEGER;
  audit_match_count INTEGER;
BEGIN
  -- Count candidates with NULL uploaded_by_user_id
  SELECT COUNT(*) INTO null_count
  FROM candidate_profiles
  WHERE uploaded_by_user_id IS NULL;

  RAISE NOTICE 'Found % candidates with NULL uploaded_by_user_id', null_count;

  -- Count how many have matching audit logs
  SELECT COUNT(DISTINCT cp.id) INTO audit_match_count
  FROM candidate_profiles cp
  INNER JOIN audit_logs al ON al.entity_id = cp.id
  WHERE cp.uploaded_by_user_id IS NULL
    AND al.action = 'insert'
    AND al.entity_type = 'candidate_profiles';

  RAISE NOTICE 'Found % candidates with matching audit logs', audit_match_count;
END $$;

-- Now perform the backfill
UPDATE candidate_profiles cp
SET uploaded_by_user_id = subquery.user_id
FROM (
  SELECT DISTINCT ON (al.entity_id)
    al.entity_id as candidate_id,
    al.user_id,
    al.created_at
  FROM audit_logs al
  WHERE al.action = 'insert'
    AND al.entity_type = 'candidate_profiles'
    AND al.entity_id IS NOT NULL
    AND al.user_id IS NOT NULL
  ORDER BY al.entity_id, al.created_at ASC  -- Get the EARLIEST insert
) subquery
WHERE cp.id = subquery.candidate_id
  AND cp.uploaded_by_user_id IS NULL;  -- Only update NULL values

-- Report results
DO $$
DECLARE
  updated_count INTEGER;
  remaining_null INTEGER;
BEGIN
  -- Count how many were updated (this won't work in same transaction, but shows intent)
  SELECT COUNT(*) INTO remaining_null
  FROM candidate_profiles
  WHERE uploaded_by_user_id IS NULL;

  RAISE NOTICE 'After backfill: % candidates still have NULL uploaded_by_user_id', remaining_null;
  RAISE NOTICE 'These candidates likely have no audit log records (uploaded before audit logging was implemented)';
END $$;
