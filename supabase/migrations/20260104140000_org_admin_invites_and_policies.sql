-- =========================
-- Org Admin Invites (platform super_admin creates org + invites org_admin)
-- =========================
CREATE TABLE IF NOT EXISTS public.org_admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.org_admin_invites ENABLE ROW LEVEL SECURITY;

-- Only platform super admins can manage org admin invites
CREATE POLICY "Platform super admins can manage org admin invites"
ON public.org_admin_invites
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Accept org admin invite: grants org_admin role for the current user
CREATE OR REPLACE FUNCTION public.accept_org_admin_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record org_admin_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM org_admin_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Optional safety: ensure invite email matches current auth user email
  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RAISE EXCEPTION 'Invite email does not match signed-in user';
  END IF;

  org_id := invite_record.organization_id;

  UPDATE org_admin_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'org_admin', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;

-- =========================
-- Manager Invites (org_admin invites account_manager)
-- =========================
CREATE TABLE IF NOT EXISTS public.manager_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.manager_invites ENABLE ROW LEVEL SECURITY;

-- Org admins can manage manager invites for their org
CREATE POLICY "Org admins can view manager invites"
ON public.manager_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can create manager invites"
ON public.manager_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can update manager invites"
ON public.manager_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can delete manager invites"
ON public.manager_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

-- Accept manager invite: grants account_manager role for the current user
CREATE OR REPLACE FUNCTION public.accept_manager_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record manager_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM manager_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RAISE EXCEPTION 'Invite email does not match signed-in user';
  END IF;

  org_id := invite_record.organization_id;

  UPDATE manager_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'account_manager', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;

-- Org admins can view user_roles in their org (for user management)
CREATE POLICY "Org admins can view org user roles"
ON public.user_roles
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (auth.uid() = user_id OR has_role(auth.uid(), 'org_admin'))
);

-- Org admins can view relevant profiles in their org (for user management)
CREATE POLICY "Org admins can view org profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'org_admin')
  AND user_id IN (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.organization_id = get_user_organization(auth.uid())
  )
);

-- Remove manager from org (org_admin only)
CREATE OR REPLACE FUNCTION public.remove_manager_from_org(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can remove managers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role = 'account_manager'
      AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'User is not a manager in your organization';
  END IF;

  DELETE FROM user_roles
  WHERE user_id = _user_id
    AND role = 'account_manager'
    AND organization_id = get_user_organization(auth.uid());
END;
$$;


