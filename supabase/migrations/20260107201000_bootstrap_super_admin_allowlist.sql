-- Bootstrap Platform Admin (super_admin) role for allowlisted emails
-- This avoids manual SQL after `supabase db reset` when recreating internal admins in Studio.
--
-- IMPORTANT:
-- - This is intended for internal operator accounts only.
-- - Normal users must never be able to self-assign privileged roles.

-- 1) Prevent privilege escalation: users must NOT be able to insert roles directly.
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

-- 2) Allowlist table for internal platform admins
CREATE TABLE IF NOT EXISTS public.platform_admin_allowlist (
  email text PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_allowlist ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read the allowlist (optional; keeps it internal).
DROP POLICY IF EXISTS "Super admins can read platform admin allowlist" ON public.platform_admin_allowlist;
CREATE POLICY "Super admins can read platform admin allowlist"
ON public.platform_admin_allowlist
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- NOTE:
-- Do NOT hardcode a single production email here.
-- In each environment, add platform admin emails via Supabase Studio (Table Editor)
-- by inserting rows into `public.platform_admin_allowlist`.

-- 3) Extend the new-user trigger to auto-assign super_admin for allowlisted emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, 'super_admin', NULL)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


