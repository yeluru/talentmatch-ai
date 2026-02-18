-- Add client_id column to jobs table to link jobs to clients
-- This allows tracking which client each job is for

-- Add client_id column (nullable for backward compatibility with existing jobs)
ALTER TABLE public.jobs
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Create index for performance when filtering/joining by client
CREATE INDEX idx_jobs_client_id ON public.jobs(client_id);

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.client_id IS 'Client this job is for. Nullable for backward compatibility with existing jobs. New jobs should have a client assigned.';

-- Note: We intentionally do NOT add NOT NULL constraint yet to allow retrofitting existing jobs
-- Once all jobs have been assigned clients, a future migration can add the constraint if desired
