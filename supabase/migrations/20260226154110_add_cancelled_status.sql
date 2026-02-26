-- Add 'cancelled' as a valid status for talent_search_jobs
ALTER TABLE public.talent_search_jobs 
DROP CONSTRAINT IF EXISTS talent_search_jobs_status_check;

ALTER TABLE public.talent_search_jobs 
ADD CONSTRAINT talent_search_jobs_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

COMMENT ON COLUMN public.talent_search_jobs.status IS 
'Job status: pending (queued), processing (running), completed (done), failed (error), cancelled (stopped by user)';
