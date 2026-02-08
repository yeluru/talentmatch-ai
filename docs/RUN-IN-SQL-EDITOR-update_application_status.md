# Fix: "Could not find the function public.update_application_status"

If you see this error when moving a candidate in the pipeline (e.g. RTR, screening, drag to stage):

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Copy the **entire** SQL below into a new query.
3. Click **Run**.
4. Retry the pipeline move in the app.

```sql
CREATE OR REPLACE FUNCTION public.update_application_status(
  _application_id uuid,
  _status text,
  _candidate_id uuid DEFAULT NULL,
  _outcome text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_id uuid;
  _app_candidate_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can update application status';
  END IF;

  SELECT job_id, candidate_id INTO _job_id, _app_candidate_id
  FROM public.applications
  WHERE id = _application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = _job_id AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Application job not in your organization';
  END IF;

  UPDATE public.applications
  SET
    status = _status,
    outcome = CASE WHEN _status = 'final_update' AND _outcome IS NOT NULL THEN _outcome ELSE outcome END
  WHERE id = _application_id;

  IF _candidate_id IS NOT NULL AND public.recruiter_can_access_candidate(_candidate_id) THEN
    IF _recruiter_notes IS NOT NULL THEN
      UPDATE public.candidate_profiles
      SET recruiter_status = _status, recruiter_notes = NULLIF(trim(_recruiter_notes), '')
      WHERE id = _candidate_id;
    ELSE
      UPDATE public.candidate_profiles
      SET recruiter_status = _status
      WHERE id = _candidate_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text, uuid, text, text) TO service_role;
```

Same SQL is in: `supabase/migrations/RUN_IF_MISSING_update_application_status.sql`
