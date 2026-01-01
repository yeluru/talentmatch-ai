-- Create a function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Update user_roles policies to allow super admin to view all roles
DROP POLICY IF EXISTS "Super admins can view all user roles" ON public.user_roles;
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete any user role
DROP POLICY IF EXISTS "Super admins can delete user roles" ON public.user_roles;
CREATE POLICY "Super admins can delete user roles"
ON public.user_roles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can update any user role
DROP POLICY IF EXISTS "Super admins can update user roles" ON public.user_roles;
CREATE POLICY "Super admins can update user roles"
ON public.user_roles
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Super admins can view all profiles
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete profiles
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;
CREATE POLICY "Super admins can delete profiles"
ON public.profiles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can view all candidate profiles
DROP POLICY IF EXISTS "Super admins can view all candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can view all candidate profiles"
ON public.candidate_profiles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete candidate profiles
DROP POLICY IF EXISTS "Super admins can delete candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can delete candidate profiles"
ON public.candidate_profiles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can update candidate profiles (for suspension etc)
DROP POLICY IF EXISTS "Super admins can update candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can update candidate profiles"
ON public.candidate_profiles
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Create a table to track user suspensions
CREATE TABLE IF NOT EXISTS public.user_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  suspended_by uuid NOT NULL,
  reason text,
  suspended_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  lifted_at timestamp with time zone,
  lifted_by uuid
);

-- Enable RLS on suspensions table
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage suspensions
CREATE POLICY "Super admins can manage suspensions"
ON public.user_suspensions
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Users can view their own suspension status
CREATE POLICY "Users can view own suspension"
ON public.user_suspensions
FOR SELECT
USING (auth.uid() = user_id);