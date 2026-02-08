-- Restore login: ensure users can read their own user_roles and profile.
--
-- The account-managers dropdown in the pipeline is fixed via the
-- get-org-account-managers edge function only (no RLS changes). This migration
-- only removes any leftover broad policies and restores the two base policies
-- required for auth/role resolution.

-- 1) Remove org-wide policies that caused RLS recursion (if they exist).
DROP POLICY IF EXISTS "Org members can view user_roles in same org" ON public.user_roles;
DROP POLICY IF EXISTS "Org members can view org member profiles" ON public.profiles;

-- 2) Restore: users must see their own user_roles rows (required for login).
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3) Restore: users must see their own profile.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
