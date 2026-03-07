-- Find duplicate candidates based on name + email + title composite key
-- Run this in your Supabase SQL Editor to see duplicates in production

-- Query 1: Find exact duplicates (name + email + title match)
SELECT
  LOWER(TRIM(full_name)) as name,
  LOWER(TRIM(email)) as email,
  LOWER(TRIM(current_title)) as title,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY created_at DESC) as candidate_ids,
  MIN(created_at)::date as oldest_created,
  MAX(created_at)::date as newest_created
FROM candidate_profiles
WHERE email IS NOT NULL
  AND email != ''
  AND full_name IS NOT NULL
  AND full_name != ''
  AND current_title IS NOT NULL
  AND current_title != ''
GROUP BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, newest_created DESC
LIMIT 50;

-- Query 2: Get details of duplicates for manual review
WITH duplicates AS (
  SELECT
    LOWER(TRIM(full_name)) as normalized_name,
    LOWER(TRIM(email)) as normalized_email,
    LOWER(TRIM(current_title)) as normalized_title,
    COUNT(*) as dup_count
  FROM candidate_profiles
  WHERE email IS NOT NULL AND email != ''
    AND full_name IS NOT NULL AND full_name != ''
    AND current_title IS NOT NULL AND current_title != ''
  GROUP BY LOWER(TRIM(full_name)), LOWER(TRIM(email)), LOWER(TRIM(current_title))
  HAVING COUNT(*) > 1
)
SELECT
  cp.id,
  cp.full_name,
  cp.email,
  cp.current_title,
  cp.current_company,
  cp.location,
  cp.created_at,
  cp.ats_score,
  (SELECT COUNT(*) FROM resumes WHERE candidate_id = cp.id) as resume_count,
  (SELECT COUNT(*) FROM candidate_org_links WHERE candidate_id = cp.id AND status = 'active') as org_link_count
FROM candidate_profiles cp
INNER JOIN duplicates d
  ON LOWER(TRIM(cp.full_name)) = d.normalized_name
  AND LOWER(TRIM(cp.email)) = d.normalized_email
  AND LOWER(TRIM(cp.current_title)) = d.normalized_title
ORDER BY
  LOWER(TRIM(cp.full_name)),
  LOWER(TRIM(cp.email)),
  cp.created_at DESC;

-- Query 3: Count total duplicates by organization
SELECT
  o.name as organization,
  COUNT(DISTINCT composite_key) as duplicate_groups,
  SUM(dup_count - 1) as excess_profiles
FROM (
  SELECT
    col.organization_id,
    LOWER(TRIM(cp.full_name)) || '|' || LOWER(TRIM(cp.email)) || '|' || LOWER(TRIM(cp.current_title)) as composite_key,
    COUNT(*) as dup_count
  FROM candidate_profiles cp
  INNER JOIN candidate_org_links col ON col.candidate_id = cp.id
  WHERE col.status = 'active'
    AND cp.email IS NOT NULL AND cp.email != ''
    AND cp.full_name IS NOT NULL AND cp.full_name != ''
    AND cp.current_title IS NOT NULL AND cp.current_title != ''
  GROUP BY col.organization_id, composite_key
  HAVING COUNT(*) > 1
) subq
LEFT JOIN organizations o ON o.id = subq.organization_id
GROUP BY o.name
ORDER BY excess_profiles DESC;
