-- Run this in Supabase Dashboard > SQL Editor if you get "Could not find the function public.update_candidate_recruiter_notes"
-- (creates the RPC and grants so AM can save comments on pipeline candidates)

CREATE OR REPLACE FUNCTION public.update_candidate_recruiter_notes(_candidate_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can update candidate notes';
  END IF;

  IF NOT public.recruiter_can_access_candidate(_candidate_id) THEN
    RAISE EXCEPTION 'You do not have access to this candidate';
  END IF;

  UPDATE public.candidate_profiles
  SET recruiter_notes = NULLIF(trim(_notes), '')
  WHERE id = _candidate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_candidate_recruiter_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_candidate_recruiter_notes(uuid, text) TO service_role;
