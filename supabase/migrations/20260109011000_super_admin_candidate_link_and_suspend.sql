-- Super Admin candidate management (support tooling)
-- - Link/unlink candidate to org (candidate_org_links)
-- - Toggle candidate marketplace opt-in
-- - Suspend/unsuspend user (soft disable via profile flag; app enforces)
-- All actions are audit logged.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Ensure audit coverage for new tables
DROP TRIGGER IF EXISTS audit_candidate_org_links_write ON public.candidate_org_links;
CREATE TRIGGER audit_candidate_org_links_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_org_links
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_engagements_write ON public.candidate_engagements;
CREATE TRIGGER audit_candidate_engagements_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_engagements
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

CREATE OR REPLACE FUNCTION public.super_admin_set_user_suspended(
  _user_id uuid,
  _is_suspended boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can suspend users';
  END IF;

  UPDATE public.profiles
  SET is_suspended = _is_suspended
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    CASE WHEN _is_suspended THEN 'suspend_user' ELSE 'unsuspend_user' END,
    'profiles',
    _user_id,
    jsonb_build_object('target_user_id', _user_id, 'is_suspended', _is_suspended, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_candidate_marketplace_opt_in(
  _candidate_user_id uuid,
  _opt_in boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update candidate marketplace settings';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  UPDATE public.candidate_profiles
  SET marketplace_opt_in = _opt_in,
      marketplace_visibility_level = CASE WHEN _opt_in THEN 'limited' ELSE 'anonymous' END
  WHERE id = cp_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    'set_candidate_marketplace_opt_in',
    'candidate_profiles',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'marketplace_opt_in', _opt_in, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_link_candidate_to_org(
  _candidate_user_id uuid,
  _organization_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can link candidates to organizations';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, _organization_id, 'super_admin', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'super_admin', created_by = auth.uid();

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    _organization_id,
    auth.uid(),
    'super_admin_link_candidate_to_org',
    'candidate_org_links',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'organization_id', _organization_id, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_unlink_candidate_from_org(
  _candidate_user_id uuid,
  _organization_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can unlink candidates from organizations';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.candidate_org_links
  SET status = 'inactive'
  WHERE candidate_id = cp_id
    AND organization_id = _organization_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    _organization_id,
    auth.uid(),
    'super_admin_unlink_candidate_from_org',
    'candidate_org_links',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'organization_id', _organization_id, 'reason', _reason),
    NULL
  );
END;
$$;

