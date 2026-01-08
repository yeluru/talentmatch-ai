-- Align RBAC behavior with product RBAC doc:
-- - Platform admin (super_admin) can revoke org_admin
-- - org_admin can manage recruiters and recruiter invites for their org
-- - org_admin can manage candidates linked to their org (notes/status/link/unlink) via RPCs

-- =========================
-- Recruiter invites: allow org_admin to manage invites for their org
-- =========================
ALTER TABLE public.recruiter_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view org recruiter invites"
ON public.recruiter_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can create org recruiter invites"
ON public.recruiter_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can update org recruiter invites"
ON public.recruiter_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can delete org recruiter invites"
ON public.recruiter_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

-- =========================
-- Remove recruiter: allow org_admin OR account_manager
-- =========================
CREATE OR REPLACE FUNCTION public.remove_recruiter_from_org(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is an org admin OR manager in the same org
  IF NOT (has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'account_manager')) THEN
    RAISE EXCEPTION 'Only org admins or account managers can remove recruiters';
  END IF;
  
  -- Check if target is a recruiter in the same org
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id 
    AND role = 'recruiter'
    AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'User is not a recruiter in your organization';
  END IF;
  
  -- Delete the user role (this removes them from org)
  DELETE FROM user_roles 
  WHERE user_id = _user_id 
  AND role = 'recruiter'
  AND organization_id = get_user_organization(auth.uid());
END;
$$;

-- =========================
-- Candidate management (org-linked candidates)
-- org_admin can VIEW org-linked candidates; mutations occur via RPCs for safety.
-- =========================
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view org candidates"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin')
  AND organization_id = get_user_organization(auth.uid())
);

-- Update candidate org-linking by email (public candidates supported)
CREATE OR REPLACE FUNCTION public.org_admin_link_candidate_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  org_id uuid;
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
  INSERT INTO public.candidate_profiles (user_id, organization_id)
  VALUES (target_user_id, org_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- If candidate already belongs to a different org, block.
  IF EXISTS (
    SELECT 1 FROM public.candidate_profiles
    WHERE user_id = target_user_id
      AND organization_id IS NOT NULL
      AND organization_id <> org_id
  ) THEN
    RAISE EXCEPTION 'Candidate is already linked to another organization';
  END IF;

  UPDATE public.candidate_profiles
  SET organization_id = org_id
  WHERE user_id = target_user_id;

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
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can unlink candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  UPDATE public.candidate_profiles
  SET organization_id = NULL
  WHERE user_id = _candidate_user_id
    AND organization_id = org_id;
END;
$$;

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
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can update candidate admin fields';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  -- Only update candidates currently linked to this org.
  UPDATE public.candidate_profiles
  SET
    recruiter_status = COALESCE(_recruiter_status, recruiter_status),
    recruiter_notes = COALESCE(_recruiter_notes, recruiter_notes)
  WHERE user_id = _candidate_user_id
    AND organization_id = org_id;
END;
$$;

-- =========================
-- Platform admin: revoke org admins
-- =========================
CREATE OR REPLACE FUNCTION public.revoke_org_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can revoke org admins';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin';
END;
$$;



