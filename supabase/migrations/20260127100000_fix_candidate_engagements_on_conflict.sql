-- Fix: allow ON CONFLICT (organization_id, candidate_id, job_id) upserts.
-- Postgres ON CONFLICT requires a unique index/constraint that matches the conflict target exactly.
-- A partial unique index (WHERE job_id IS NOT NULL) does NOT match and causes:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'candidate_engagements_org_candidate_job_uniq'
  ) THEN
    DROP INDEX public.candidate_engagements_org_candidate_job_uniq;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'candidate_engagements_org_candidate_job_uniq_full'
  ) THEN
    DROP INDEX public.candidate_engagements_org_candidate_job_uniq_full;
  END IF;
END $$;

-- Note: unique indexes allow multiple NULLs in job_id, which is fine for legacy/placeholder engagements.
-- Job-scoped engagements always set job_id, so this provides the needed conflict target for upserts.
CREATE UNIQUE INDEX candidate_engagements_org_candidate_job_uniq_full
ON public.candidate_engagements (organization_id, candidate_id, job_id);

