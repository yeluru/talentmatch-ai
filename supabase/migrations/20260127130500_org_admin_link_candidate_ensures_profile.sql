-- Ensure org-admin linking creates a corresponding public.profiles row if missing.

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
  target_email text;
  inferred_name text;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can link candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id, email,
         COALESCE(
           NULLIF(raw_user_meta_data->>'full_name',''),
           NULLIF(raw_user_meta_data->>'name',''),
           NULLIF(split_part(email, '@', 1), ''),
           'Candidate'
         )
  INTO target_user_id, target_email, inferred_name
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure profiles row exists (some legacy users may miss it)
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (target_user_id, target_email, inferred_name)
  ON CONFLICT (user_id) DO NOTHING;

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

