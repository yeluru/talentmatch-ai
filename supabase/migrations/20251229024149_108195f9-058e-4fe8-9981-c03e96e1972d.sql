-- Add content_hash column to resumes table for duplicate detection
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS content_hash text;

-- Create index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_resumes_content_hash ON public.resumes(content_hash) WHERE content_hash IS NOT NULL;