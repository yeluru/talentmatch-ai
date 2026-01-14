-- Add work_mode (onsite/hybrid/remote/unknown) and expand experience_level options.
-- We keep existing `job_type` (employment type) intact.

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS work_mode TEXT DEFAULT 'unknown';

-- Add/replace check constraint for work_mode
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_work_mode_check'
  ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_work_mode_check;
  END IF;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_work_mode_check
CHECK (work_mode IN ('onsite', 'hybrid', 'remote', 'unknown'));

-- Expand experience_level check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_experience_level_check'
  ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_experience_level_check;
  END IF;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_experience_level_check
CHECK (experience_level IN (
  'entry',
  'mid',
  'senior',
  'lead',
  'principal_architect',
  'manager',
  'director',
  'executive',
  'unknown'
));

