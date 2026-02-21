-- Add logging to disengage_candidate to debug production issues

CREATE OR REPLACE FUNCTION public.disengage_candidate(_candidate_id uuid, _job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid;
  _other_engagements_count int;
  _deleted_engagements int;
  _deleted_applications int;
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
    RAISE EXCEPTION 'Only recruiters and account managers can disengage candidates';
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

  RAISE NOTICE '[disengage_candidate] Starting disengage for candidate % from job %', _candidate_id, _job_id;

  -- Delete the engagement
  DELETE FROM public.candidate_engagements
  WHERE candidate_id = _candidate_id
    AND job_id = _job_id
    AND organization_id = _org_id;

  GET DIAGNOSTICS _deleted_engagements = ROW_COUNT;
  RAISE NOTICE '[disengage_candidate] Deleted % engagement records', _deleted_engagements;

  -- Delete the application
  DELETE FROM public.applications
  WHERE candidate_id = _candidate_id
    AND job_id = _job_id;

  GET DIAGNOSTICS _deleted_applications = ROW_COUNT;
  RAISE NOTICE '[disengage_candidate] Deleted % application records', _deleted_applications;

  -- Explicitly bypass RLS for candidate_profiles update
  SET LOCAL row_security = off;

  -- Check if candidate has other active engagements
  SELECT COUNT(*) INTO _other_engagements_count
  FROM public.candidate_engagements
  WHERE candidate_id = _candidate_id;

  RAISE NOTICE '[disengage_candidate] Remaining engagements count: %', _other_engagements_count;

  -- If no other engagements, reset status to 'new'
  IF _other_engagements_count = 0 THEN
    RAISE NOTICE '[disengage_candidate] Resetting status to new for candidate %', _candidate_id;
    UPDATE public.candidate_profiles
    SET recruiter_status = 'new'
    WHERE id = _candidate_id;
    RAISE NOTICE '[disengage_candidate] Status update completed';
  ELSE
    RAISE NOTICE '[disengage_candidate] NOT resetting status - candidate has % other engagements', _other_engagements_count;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disengage_candidate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disengage_candidate(uuid, uuid) TO service_role;
