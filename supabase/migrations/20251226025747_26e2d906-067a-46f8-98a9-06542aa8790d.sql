
-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;

CREATE POLICY "Anyone can create organizations" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (true);
