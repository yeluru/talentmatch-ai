-- Add progress tracking for incremental background processing
-- Allows processing 10,000+ candidates without timeout

ALTER TABLE public.talent_search_jobs
ADD COLUMN IF NOT EXISTS last_processed_index INTEGER DEFAULT 0;

COMMENT ON COLUMN public.talent_search_jobs.last_processed_index IS
'Tracks progress for incremental processing. Index of last processed candidate in the batch.';
