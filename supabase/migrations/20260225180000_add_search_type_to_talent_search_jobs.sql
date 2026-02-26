-- Add search_type column to distinguish between different search modes
-- This allows storing Free Text, By Job, and Web Search results in the same table

ALTER TABLE public.talent_search_jobs
ADD COLUMN IF NOT EXISTS search_type TEXT NOT NULL DEFAULT 'by_job';

-- Add CHECK constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_search_type'
  ) THEN
    ALTER TABLE public.talent_search_jobs
    ADD CONSTRAINT check_search_type
    CHECK (search_type IN ('free_text', 'by_job', 'web_search'));
  END IF;
END $$;

-- Add index for efficient lookup of latest search by type
CREATE INDEX IF NOT EXISTS idx_talent_search_jobs_org_type_created
ON public.talent_search_jobs(organization_id, search_type, created_at DESC);

-- Add column to track last processed index for async processing (already exists in recent migration, this is just for reference)
ALTER TABLE public.talent_search_jobs
ADD COLUMN IF NOT EXISTS last_processed_index INTEGER DEFAULT 0;

COMMENT ON COLUMN public.talent_search_jobs.search_type IS
'Type of search: free_text (instant), by_job (async background), web_search (external sources)';
