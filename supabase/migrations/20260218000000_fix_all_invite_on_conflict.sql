-- COMPREHENSIVE FIX: Update ALL invite acceptance functions to use correct ON CONFLICT constraint
-- Issue: After multi-role migration (20260212100000), the unique constraint changed from
--        (user_id, role) to (user_id, role, organization_id)
-- Impact: Several functions still use old ON CONFLICT (user_id, role) causing
--         "no unique or exclusion constraint matching the ON CONFLICT specification" error
-- Fix: Update all affected functions to use ON CONFLICT (user_id, role, organization_id)

-- ============================================================================
-- Fix 1: accept_recruiter_invite
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_recruiter_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record recruiter_invites%ROWTYPE;
  org_id uuid;
BEGIN
  -- Find the invite
  SELECT * INTO invite_record
  FROM recruiter_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  org_id := invite_record.organization_id;

  -- Update invite status
  UPDATE recruiter_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  -- Insert the recruiter role for current user
  -- FIXED: Changed from (user_id, role) to (user_id, role, organization_id)
  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'recruiter', org_id)
  ON CONFLICT (user_id, role, organization_id) DO NOTHING;

  RETURN org_id;
END;
$$;

-- ============================================================================
-- Fix 2: handle_new_user (super_admin bootstrap)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- If this email is allowlisted, grant platform admin role automatically.
  IF EXISTS (
    SELECT 1
    FROM public.platform_admin_allowlist a
    WHERE lower(a.email) = lower(NEW.email)
  ) THEN
    -- FIXED: Changed from (user_id, role) to (user_id, role, organization_id)
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, 'super_admin', NULL)
    ON CONFLICT (user_id, role, organization_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Fix 3: assign_user_role (candidate self-assignment)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _organization_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow users to assign roles to themselves
  IF _user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign roles to other users';
  END IF;

  -- Only allow candidate role for self-assignment
  -- Recruiter and account_manager roles must be assigned through admin workflows
  IF _role != 'candidate'::app_role THEN
    RAISE EXCEPTION 'Only candidate role can be self-assigned. Contact admin for other roles.';
  END IF;

  -- FIXED: Changed from (user_id, role) to (user_id, role, organization_id)
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (_user_id, _role, _organization_id)
  ON CONFLICT (user_id, role, organization_id) DO NOTHING;
END;
$$;

-- ============================================================================
-- Add comments for tracking
-- ============================================================================
COMMENT ON FUNCTION public.accept_recruiter_invite IS
  'Accept recruiter invite - FIXED for multi-role system ON CONFLICT constraint';

COMMENT ON FUNCTION public.handle_new_user IS
  'Bootstrap new user with profile and super_admin if allowlisted - FIXED for multi-role system';

COMMENT ON FUNCTION public.assign_user_role IS
  'Assign candidate role to self - FIXED for multi-role system ON CONFLICT constraint';
