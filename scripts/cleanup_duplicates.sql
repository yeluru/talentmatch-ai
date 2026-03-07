-- CLEANUP DUPLICATE CANDIDATES
-- ⚠️ REVIEW CAREFULLY BEFORE RUNNING ⚠️
-- This script keeps the NEWEST profile and soft-deletes older duplicates

-- SAFETY: Run Query 1 first to see what will be affected
-- Then uncomment and run the cleanup queries below

-- Step 1: Preview what will be kept vs deleted
WITH ranked_duplicates AS (
  SELECT
    id,
    full_name,
    email,
    current_title,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
      ORDER BY created_at DESC  -- Keep newest
    ) as rank
  FROM candidate_profiles
  WHERE email IS NOT NULL AND email != ''
    AND full_name IS NOT NULL AND full_name != ''
    AND current_title IS NOT NULL AND current_title != ''
)
SELECT
  id,
  full_name,
  email,
  current_title,
  created_at,
  CASE WHEN rank = 1 THEN '✅ KEEP (newest)' ELSE '❌ DELETE (older duplicate)' END as action
FROM ranked_duplicates
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE rank > 1
  UNION
  SELECT id FROM ranked_duplicates WHERE rank = 1 AND id IN (
    SELECT id FROM ranked_duplicates GROUP BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title)) HAVING COUNT(*) > 1
  )
)
ORDER BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title)), created_at DESC;

-- Step 2: DANGER ZONE - Actually delete duplicates (keeps newest)
-- ⚠️ BACKUP YOUR DATABASE FIRST ⚠️
-- ⚠️ UNCOMMENT ONLY AFTER REVIEWING STEP 1 ⚠️

/*
-- Create backup table first
CREATE TABLE IF NOT EXISTS candidate_profiles_backup_20260307 AS
SELECT * FROM candidate_profiles WHERE 1=0;

-- Backup candidates that will be deleted
INSERT INTO candidate_profiles_backup_20260307
SELECT cp.*
FROM candidate_profiles cp
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
        ORDER BY created_at DESC
      ) as rank
    FROM candidate_profiles
    WHERE email IS NOT NULL AND email != ''
      AND full_name IS NOT NULL AND full_name != ''
      AND current_title IS NOT NULL AND current_title != ''
  ) ranked
  WHERE rank > 1
);

-- Delete older duplicates (keeps the newest profile for each composite key)
DELETE FROM candidate_profiles
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
        ORDER BY created_at DESC
      ) as rank
    FROM candidate_profiles
    WHERE email IS NOT NULL AND email != ''
      AND full_name IS NOT NULL AND full_name != ''
      AND current_title IS NOT NULL AND current_title != ''
  ) ranked
  WHERE rank > 1
);

-- Verify cleanup
SELECT COUNT(*) as deleted_count FROM candidate_profiles_backup_20260307;
*/

-- Step 3: Alternative - Mark as inactive instead of delete (safer)
-- This approach keeps the data but marks duplicates as inactive

/*
-- Create a metadata table to track merged candidates
CREATE TABLE IF NOT EXISTS candidate_merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_candidate_id UUID REFERENCES candidate_profiles(id),
  merged_candidate_id UUID REFERENCES candidate_profiles(id),
  merged_at TIMESTAMP DEFAULT NOW(),
  merge_reason TEXT,
  merged_by UUID REFERENCES auth.users(id)
);

-- Mark older duplicates as inactive in candidate_org_links
WITH duplicates_to_deactivate AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
      ORDER BY created_at DESC
    ) as rank
  FROM candidate_profiles
  WHERE email IS NOT NULL AND email != ''
    AND full_name IS NOT NULL AND full_name != ''
    AND current_title IS NOT NULL AND current_title != ''
)
UPDATE candidate_org_links
SET status = 'inactive'
WHERE candidate_id IN (
  SELECT id FROM duplicates_to_deactivate WHERE rank > 1
)
AND status = 'active';

-- Log the merges
INSERT INTO candidate_merge_history (kept_candidate_id, merged_candidate_id, merge_reason)
SELECT
  (SELECT id FROM candidate_profiles WHERE LOWER(TRIM(full_name)) = d.normalized_name
   AND LOWER(TRIM(email)) = d.normalized_email
   AND LOWER(TRIM(current_title)) = d.normalized_title
   ORDER BY created_at DESC LIMIT 1) as kept_id,
  cp.id as merged_id,
  'Duplicate: same name + email + title'
FROM candidate_profiles cp
INNER JOIN (
  SELECT
    id,
    LOWER(TRIM(full_name)) as normalized_name,
    LOWER(TRIM(email)) as normalized_email,
    LOWER(TRIM(current_title)) as normalized_title,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
      ORDER BY created_at DESC
    ) as rank
  FROM candidate_profiles
  WHERE email IS NOT NULL AND email != ''
    AND full_name IS NOT NULL AND full_name != ''
    AND current_title IS NOT NULL AND current_title != ''
) d ON cp.id = d.id
WHERE d.rank > 1;
*/
