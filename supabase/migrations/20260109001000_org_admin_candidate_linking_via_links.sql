-- Update org admin candidate linking to use candidate_org_links (many-to-many)

-- Replace org-admin view policy for candidates
DROP POLICY IF EXISTS "Org admins can view org candidates" ON public.candidate_profiles;
CREATE POLICY "Org admins can view org candidates via links"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin')
  AND EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = public.candidate_profiles.id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);

-- Link candidate by email (creates link instead of overwriting a single org_id)
CREATE OR REPLACE FUNCTION public.org_admin_link_candidate_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can link candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure candidate_profile exists
  INSERT INTO public.candidate_profiles (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = target_user_id;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, org_id, 'org_admin_link', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'org_admin_link', created_by = auth.uid();

  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_admin_unlink_candidate(_candidate_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can unlink candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.candidate_org_links
  SET status = 'inactive'
  WHERE candidate_id = cp_id
    AND organization_id = org_id;
END;
$$;

-- Candidate admin fields: only allowed if candidate is linked to org
CREATE OR REPLACE FUNCTION public.org_admin_update_candidate_admin_fields(
  _candidate_user_id uuid,
  _recruiter_status text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can update candidate admin fields';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.candidate_is_linked_to_org(cp_id, org_id) THEN
    RAISE EXCEPTION 'Candidate is not linked to your organization';
  END IF;

  UPDATE public.candidate_profiles
  SET
    recruiter_status = COALESCE(_recruiter_status, recruiter_status),
    recruiter_notes = COALESCE(_recruiter_notes, recruiter_notes)
  WHERE id = cp_id;
END;
$$;

