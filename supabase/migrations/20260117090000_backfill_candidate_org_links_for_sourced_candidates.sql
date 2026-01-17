-- Backfill candidate_org_links for sourced/imported candidates.
-- Why: Recruiter visibility is driven by candidate_org_links (RLS), but older imports only set
-- candidate_profiles.organization_id for user_id IS NULL rows.
--
-- This backfills links for:
-- - sourced candidates (user_id IS NULL)
-- - that have an organization_id set
-- - and do NOT already have a candidate_org_links row for that org
--
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_at, created_by)
SELECT
  cp.id AS candidate_id,
  cp.organization_id,
  'bulk_import_backfill' AS link_type,
  'active' AS status,
  now() AS created_at,
  NULL::uuid AS created_by
FROM public.candidate_profiles cp
WHERE cp.user_id IS NULL
  AND cp.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = cp.id
      AND col.organization_id = cp.organization_id
  )
ON CONFLICT (candidate_id, organization_id) DO NOTHING;

