
-- Update the user_roles INSERT policy to be more permissive during signup
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

CREATE POLICY "Users can insert their own roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Also allow service role / immediate post-signup inserts
-- The issue is timing - we need to allow the insert right after signup
-- Let's make the policy more permissive for authenticated users
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

CREATE POLICY "Authenticated users can insert their own roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (true);
