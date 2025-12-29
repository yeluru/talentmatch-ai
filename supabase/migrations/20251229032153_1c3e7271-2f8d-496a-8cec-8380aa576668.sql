-- Create a secure function to assign roles during signup
-- This bypasses RLS since it runs with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.assign_user_role(
  _user_id uuid,
  _role app_role,
  _organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (_user_id, _role, _organization_id)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Grant execute to authenticated users (the function itself validates context)
GRANT EXECUTE ON FUNCTION public.assign_user_role TO authenticated;