-- Fix: super_admin_set_candidate_marketplace_opt_in should:
-- - set marketplace_visibility_level to full when opt-in is enabled (non-anonymous)
-- - backfill candidate_profiles.full_name/email from profiles when available

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
  p_full_name text;
  p_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update candidate marketplace settings';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  SELECT full_name, email INTO p_full_name, p_email
  FROM public.profiles
  WHERE user_id = _candidate_user_id
  LIMIT 1;

  UPDATE public.candidate_profiles
  SET marketplace_opt_in = _opt_in,
      marketplace_visibility_level = CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      full_name = COALESCE(public.candidate_profiles.full_name, p_full_name),
      email = COALESCE(public.candidate_profiles.email, p_email)
  WHERE id = cp_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    'set_candidate_marketplace_opt_in',
    'candidate_profiles',
    cp_id,
    jsonb_build_object(
      'candidate_user_id', _candidate_user_id,
      'marketplace_opt_in', _opt_in,
      'marketplace_visibility_level', CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      'reason', _reason
    ),
    NULL
  );
END;
$$;

