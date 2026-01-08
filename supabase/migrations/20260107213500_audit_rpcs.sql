-- Audit logging for privileged RPCs (explicit intent logs)
-- We prefer explicit events for key admin actions in addition to generic triggers.

-- Platform admin: revoke org admins
CREATE OR REPLACE FUNCTION public.revoke_org_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can revoke org admins';
  END IF;

  SELECT organization_id INTO org_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin'
  LIMIT 1;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin';

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    org_id,
    auth.uid(),
    'revoke_org_admin',
    'user_roles',
    _user_id,
    jsonb_build_object('revoked_user_id', _user_id),
    NULL
  );
END;
$$;


