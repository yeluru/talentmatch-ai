-- Add Primary Role Feature
-- The first role assigned to a user becomes their primary role and cannot be revoked

-- ============================================================================
-- PART 1: Add is_primary column to user_roles
-- ============================================================================

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.user_roles.is_primary IS
  'Indicates if this is the user''s primary/parent role (the first role assigned). Primary roles cannot be revoked.';

-- Add unique constraint: only one primary role per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_primary
  ON public.user_roles(user_id) WHERE is_primary = true;

-- ============================================================================
-- PART 2: Mark existing first roles as primary
-- ============================================================================

-- For each user, mark their oldest role as primary
WITH first_roles AS (
  SELECT DISTINCT ON (user_id)
    id,
    user_id
  FROM user_roles
  ORDER BY user_id, created_at ASC
)
UPDATE user_roles
SET is_primary = true
WHERE id IN (SELECT id FROM first_roles);

-- ============================================================================
-- PART 3: Update grant_role_to_user to set is_primary for first role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_role_to_user(
  target_user_id UUID,
  new_role app_role,
  target_org_id UUID DEFAULT NULL,
  caller_acting_role app_role DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  caller_roles TEXT[];
  is_super_admin BOOLEAN;
  is_org_admin BOOLEAN;
  result_row user_roles;
  existing_roles_count INT;
  is_first_role BOOLEAN;
BEGIN
  -- Get caller
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller's roles
  SELECT array_agg(role::TEXT) INTO caller_roles
  FROM user_roles
  WHERE user_id = caller_id;

  IF caller_roles IS NULL THEN
    RAISE EXCEPTION 'Caller has no roles';
  END IF;

  -- Check if caller is super admin
  is_super_admin := 'super_admin' = ANY(caller_roles);

  -- Check if caller is org admin in the target org
  is_org_admin := EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = caller_id
      AND role = 'org_admin'
      AND organization_id = target_org_id
  );

  -- Authorization check
  IF NOT is_super_admin THEN
    -- Must be org admin in the target org
    IF NOT is_org_admin THEN
      RAISE EXCEPTION 'Only org admins can grant roles in their organization';
    END IF;

    -- Can't grant super_admin role
    IF new_role = 'super_admin' THEN
      RAISE EXCEPTION 'Only platform admins can grant super_admin role';
    END IF;
  END IF;

  -- Validate target user exists
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  -- Validate organization exists (if not null)
  IF target_org_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM organizations WHERE id = target_org_id
  ) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  -- Check if this is the user's first role
  SELECT COUNT(*) INTO existing_roles_count
  FROM user_roles
  WHERE user_id = target_user_id;

  is_first_role := (existing_roles_count = 0);

  -- Insert the new role (ON CONFLICT DO NOTHING if already exists)
  INSERT INTO user_roles (user_id, role, organization_id, is_primary)
  VALUES (target_user_id, new_role, target_org_id, is_first_role)
  ON CONFLICT (user_id, role, organization_id) DO NOTHING
  RETURNING * INTO result_row;

  -- If row was inserted, log it
  IF result_row.id IS NOT NULL THEN
    INSERT INTO audit_logs (
      organization_id,
      user_id,
      action,
      entity_type,
      entity_id,
      details,
      acting_role
    ) VALUES (
      target_org_id,
      caller_id,
      'grant_role',
      'user_roles',
      result_row.id,
      jsonb_build_object(
        'target_user_id', target_user_id,
        'granted_role', new_role,
        'organization_id', target_org_id,
        'is_primary', is_first_role
      ),
      caller_acting_role::TEXT
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Role granted successfully',
      'role', new_role,
      'user_id', target_user_id,
      'is_primary', is_first_role
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User already has this role'
    );
  END IF;
END;
$$;

-- ============================================================================
-- PART 4: Update revoke_role_from_user to prevent revoking primary role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_role_from_user(
  target_user_id UUID,
  role_to_revoke app_role,
  target_org_id UUID DEFAULT NULL,
  caller_acting_role app_role DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  caller_roles TEXT[];
  is_super_admin BOOLEAN;
  is_org_admin BOOLEAN;
  deleted_count INT;
  is_primary_role BOOLEAN;
BEGIN
  -- Get caller
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller's roles
  SELECT array_agg(role::TEXT) INTO caller_roles
  FROM user_roles
  WHERE user_id = caller_id;

  IF caller_roles IS NULL THEN
    RAISE EXCEPTION 'Caller has no roles';
  END IF;

  -- Check if caller is super admin
  is_super_admin := 'super_admin' = ANY(caller_roles);

  -- Check if caller is org admin in the target org
  is_org_admin := EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = caller_id
      AND role = 'org_admin'
      AND organization_id = target_org_id
  );

  -- Authorization check
  IF NOT is_super_admin THEN
    -- Must be org admin in the target org
    IF NOT is_org_admin THEN
      RAISE EXCEPTION 'Only org admins can revoke roles in their organization';
    END IF;

    -- Can't revoke super_admin role
    IF role_to_revoke = 'super_admin' THEN
      RAISE EXCEPTION 'Only platform admins can revoke super_admin role';
    END IF;

    -- Can't revoke your own org_admin role (last protection)
    IF target_user_id = caller_id AND role_to_revoke = 'org_admin' THEN
      RAISE EXCEPTION 'Cannot revoke your own org_admin role';
    END IF;
  END IF;

  -- Check if the role to revoke is the primary role
  SELECT is_primary INTO is_primary_role
  FROM user_roles
  WHERE user_id = target_user_id
    AND role = role_to_revoke
    AND (organization_id = target_org_id OR (organization_id IS NULL AND target_org_id IS NULL));

  -- Prevent revoking primary role
  IF is_primary_role THEN
    RAISE EXCEPTION 'Cannot revoke primary role - this is the user''s original role assigned when they were invited';
  END IF;

  -- Prevent users from being left with no roles
  IF (SELECT COUNT(*) FROM user_roles WHERE user_id = target_user_id) <= 1 THEN
    RAISE EXCEPTION 'Cannot revoke last role - user must have at least one role';
  END IF;

  -- Delete the role
  DELETE FROM user_roles
  WHERE user_id = target_user_id
    AND role = role_to_revoke
    AND (organization_id = target_org_id OR (organization_id IS NULL AND target_org_id IS NULL));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log the revocation
  IF deleted_count > 0 THEN
    INSERT INTO audit_logs (
      organization_id,
      user_id,
      action,
      entity_type,
      details,
      acting_role
    ) VALUES (
      target_org_id,
      caller_id,
      'revoke_role',
      'user_roles',
      jsonb_build_object(
        'target_user_id', target_user_id,
        'revoked_role', role_to_revoke,
        'organization_id', target_org_id
      ),
      caller_acting_role::TEXT
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Role revoked successfully',
      'role', role_to_revoke,
      'user_id', target_user_id
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User does not have this role'
    );
  END IF;
END;
$$;

-- ============================================================================
-- PART 5: Update get_org_users_with_roles to include is_primary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_users_with_roles(
  org_id UUID
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  roles JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  is_authorized BOOLEAN;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if caller is org_admin or super_admin
  is_authorized := EXISTS(
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = caller_id
      AND (
        ur.role = 'super_admin'
        OR (ur.role = 'org_admin' AND ur.organization_id = org_id)
      )
  );

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Not authorized to view organization users';
  END IF;

  -- Return all users in this org with their roles
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    p.full_name,
    jsonb_agg(
      jsonb_build_object(
        'role', ur.role,
        'organization_id', ur.organization_id,
        'created_at', ur.created_at,
        'is_primary', ur.is_primary
      ) ORDER BY ur.is_primary DESC, ur.created_at ASC
    ) AS roles
  FROM auth.users u
  JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN profiles p ON p.user_id = u.id
  WHERE ur.organization_id = org_id
  GROUP BY u.id, u.email, p.full_name
  ORDER BY p.full_name;
END;
$$;

-- ============================================================================
-- PART 6: Update comments
-- ============================================================================

COMMENT ON FUNCTION public.grant_role_to_user IS
  'Grant a role to a user. The first role assigned becomes their primary role. Only org_admin (for their org) or super_admin can call this.';

COMMENT ON FUNCTION public.revoke_role_from_user IS
  'Revoke a role from a user. Cannot revoke primary role or last role. Only org_admin (for their org) or super_admin can call this.';
