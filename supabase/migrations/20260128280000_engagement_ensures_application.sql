-- Ensure every candidate_engagement has a matching application so the candidate shows in
-- My Applicants for the job owner. Fixes: engagement exists (pipeline) but no application row.

-- 1) Backfill: create application rows for existing engagements that don't have one (SECURITY DEFINER so migration can run)
CREATE OR REPLACE FUNCTION public.backfill_applications_for_engagements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    SELECT e.job_id, e.candidate_id, 'outreach', COALESCE(e.created_at, now())
    FROM public.candidate_engagements e
    WHERE e.job_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.job_id = e.job_id AND a.candidate_id = e.candidate_id
      )
    ON CONFLICT (job_id, candidate_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

SELECT public.backfill_applications_for_engagements();

DROP FUNCTION public.backfill_applications_for_engagements();

-- 2) Trigger: when an engagement is created, ensure an application exists (runs as invoking user so RLS applies)
CREATE OR REPLACE FUNCTION public.ensure_application_for_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    VALUES (NEW.job_id, NEW.candidate_id, 'outreach', COALESCE(NEW.created_at, now()))
    ON CONFLICT (job_id, candidate_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_application_for_engagement ON public.candidate_engagements;
CREATE TRIGGER trg_ensure_application_for_engagement
  AFTER INSERT ON public.candidate_engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_application_for_engagement();
