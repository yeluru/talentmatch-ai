-- Fix start_engagement to bypass RLS when updating candidate_profiles.recruiter_status
-- The SECURITY DEFINER alone isn't enough - we need explicit RLS bypass

CREATE OR REPLACE FUNCTION public.start_engagement(_candidate_id uuid, _job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    has_role(_user_id, 'recruiter'::app_role)
    OR has_role(_user_id, 'account_manager'::app_role)
    OR has_role(_user_id, 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can start engagements';
  END IF;

  _org_id := get_user_organization(_user_id);
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = _job_id AND organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'Job not found or not in your organization';
  END IF;

  IF NOT public.recruiter_can_access_candidate(_candidate_id) THEN
    RAISE EXCEPTION 'You do not have access to this candidate';
  END IF;

  INSERT INTO public.candidate_engagements (
    organization_id,
    candidate_id,
    job_id,
    stage,
    created_by,
    owner_user_id
  )
  VALUES (
    _org_id,
    _candidate_id,
    _job_id,
    'outreach',
    _user_id,
    _user_id
  )
  ON CONFLICT (organization_id, candidate_id, job_id)
  DO UPDATE SET
    stage = 'outreach',
    updated_at = now();

  INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
  VALUES (_job_id, _candidate_id, 'outreach', now())
  ON CONFLICT (job_id, candidate_id)
  DO UPDATE SET
    status = 'outreach',
    applied_at = now();

  -- Explicitly bypass RLS for this UPDATE since SECURITY DEFINER alone isn't enough
  -- This is safe because we've already validated permissions above
  SET LOCAL row_security = off;

  -- So talent pool row stage dropdown reflects pipeline (e.g. "Engaged" / outreach)
  UPDATE public.candidate_profiles
  SET recruiter_status = 'outreach'
  WHERE id = _candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_engagement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_engagement(uuid, uuid) TO service_role;
