-- Remove overly-permissive policy added previously (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service can insert agent recommendations" ON public.agent_recommendations;