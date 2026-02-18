-- Add client_id column to jobs table to link jobs to clients
-- This allows tracking which client each job is for

-- Add client_id column (nullable for backward compatibility with existing jobs)
-- Use DO block to check if column exists first (idempotent migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.jobs
      ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance when filtering/joining by client (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON public.jobs(client_id);

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.client_id IS 'Client this job is for. Nullable for backward compatibility with existing jobs. New jobs should have a client assigned.';

-- Note: We intentionally do NOT add NOT NULL constraint yet to allow retrofitting existing jobs
-- Once all jobs have been assigned clients, a future migration can add the constraint if desired
