-- HOTFIX: Fix invite functions to use correct ON CONFLICT constraint
-- Issue: After multi-role migration, ON CONFLICT (user_id, role) no longer works
-- Fix: Change to ON CONFLICT (user_id, role, organization_id)

-- Fix accept_org_admin_invite function
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

  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RETURN NULL;
  END IF;

  org_id := invite_record.organization_id;

  UPDATE org_admin_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'org_admin', org_id)
  ON CONFLICT (user_id, role, organization_id) DO NOTHING;

  RETURN org_id;
END;
$$;

-- Fix accept_manager_invite function
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
    RETURN NULL;
  END IF;

  org_id := invite_record.organization_id;

  UPDATE manager_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'account_manager', org_id)
  ON CONFLICT (user_id, role, organization_id) DO NOTHING;

  RETURN org_id;
END;
$$;

COMMENT ON FUNCTION public.accept_org_admin_invite IS
  'Accept org admin invite - HOTFIXED for multi-role system';
COMMENT ON FUNCTION public.accept_manager_invite IS
  'Accept manager invite - HOTFIXED for multi-role system';
