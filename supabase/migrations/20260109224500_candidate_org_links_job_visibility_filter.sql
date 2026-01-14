-- Candidates should only gain access to tenant-private jobs when there is an explicit
-- candidate-facing relationship (invite/apply/admin link). Internal workflow links like
-- link_type = 'engagement' must NOT grant candidates access to all private jobs.
--
-- This function is used by the jobs SELECT policy for candidates.

CREATE OR REPLACE FUNCTION public.candidate_org_ids_for_user(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT col.organization_id
  FROM public.candidate_org_links col
  JOIN public.candidate_profiles cp ON cp.id = col.candidate_id
  WHERE cp.user_id = _user_id
    AND col.status = 'active'
    AND col.link_type IN (
      'invite_code',
      'application',
      'org_admin_link',
      'super_admin',
      'legacy_org_id'
    );
$$;

