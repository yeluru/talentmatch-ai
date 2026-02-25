-- Fix: Add UPDATE policy for talent_search_jobs
-- The background processor needs to update status and results

CREATE POLICY "Service role can update search jobs"
  ON public.talent_search_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Service role can update search jobs" ON public.talent_search_jobs IS
'Allow edge functions to update search job status and results';
