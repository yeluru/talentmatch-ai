-- Single pipeline: one ordered list of stages in applications.status.
-- Two entry points: (1) Public apply → status 'applied'. (2) Recruiter starts engagement → status 'outreach'.
-- All candidates then move through the same stages. Engagement rows kept for email/requests; stage synced to application.status.

-- Migrate any rows that used the old 'engaged' status to 'outreach'
UPDATE public.applications SET status = 'outreach' WHERE status = 'engaged';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'rate_confirmation',
    'right_to_represent',
    'applied',
    'reviewing',
    'reviewed',
    'screening',
    'shortlisted',
    'interviewing',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
  )
);
