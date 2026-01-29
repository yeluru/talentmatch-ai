-- Allow additional pipeline stages on applications.status
-- (UI uses "reviewing" + "screening"; older rows may still have "reviewed")

DO $$
DECLARE
  r record;
BEGIN
  -- Drop any existing CHECK constraints that mention the status column
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

