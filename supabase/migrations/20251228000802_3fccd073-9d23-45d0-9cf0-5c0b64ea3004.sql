-- Allow recruiters to view all profiles (for talent pool search)
CREATE POLICY "Recruiters can view all profiles for talent search" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'recruiter'::app_role));

-- Allow service role to insert agent recommendations (edge function uses service role)
-- Note: Service role bypasses RLS, but adding this for completeness
CREATE POLICY "Service can insert agent recommendations" 
ON public.agent_recommendations 
FOR INSERT 
WITH CHECK (true);