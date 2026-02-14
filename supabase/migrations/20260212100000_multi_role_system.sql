-- Multi-Role System: Allow users to have multiple roles across organizations
-- This migration enables:
-- 1. Same user can have same role in different orgs (e.g., recruiter in Org A and Org B)
-- 2. Platform admin can also be account_manager/recruiter in a test org
-- 3. Track which role user was acting in when performing actions

-- ============================================================================
-- PART 1: Fix user_roles unique constraint
-- ============================================================================

-- Drop old constraint that prevents same user having same role in different orgs
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add new constraint that allows same role in different orgs
-- NULL organization_id is treated as distinct (platform admin)
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_role_org_unique
  UNIQUE NULLS NOT DISTINCT (user_id, role, organization_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_org
  ON public.user_roles(user_id, organization_id);

-- ============================================================================
-- PART 2: Add acting_role to audit_logs
-- ============================================================================

-- Add column to track which role the user was acting in when performing the action
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS acting_role TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.audit_logs.acting_role IS
  'The role the user was acting in when performing this action (for multi-role users)';

-- ============================================================================
-- PART 3: RPC Functions for Role Management
-- ============================================================================

-- Function: Grant a role to a user (org admin or super admin only)
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

  -- Insert the new role (ON CONFLICT DO NOTHING if already exists)
  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (target_user_id, new_role, target_org_id)
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
        'organization_id', target_org_id
      ),
      caller_acting_role::TEXT
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Role granted successfully',
      'role', new_role,
      'user_id', target_user_id
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User already has this role'
    );
  END IF;
END;
$$;

-- Function: Revoke a role from a user (org admin or super admin only)
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

-- Function: Get all users and their roles in an organization (for role management UI)
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
        'created_at', ur.created_at
      )
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
-- PART 4: Grant permissions for new functions
-- ============================================================================

-- Allow authenticated users to call these functions
-- (Authorization is checked inside the functions)
GRANT EXECUTE ON FUNCTION public.grant_role_to_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role_from_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_users_with_roles TO authenticated;

-- ============================================================================
-- PART 5: Update comments
-- ============================================================================

COMMENT ON FUNCTION public.grant_role_to_user IS
  'Grant a role to a user. Only org_admin (for their org) or super_admin can call this.';

COMMENT ON FUNCTION public.revoke_role_from_user IS
  'Revoke a role from a user. Only org_admin (for their org) or super_admin can call this. Cannot revoke last role.';

COMMENT ON FUNCTION public.get_org_users_with_roles IS
  'Get all users in an organization with their roles. Only org_admin or super_admin can call this.';
