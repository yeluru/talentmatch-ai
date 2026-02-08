-- Simplify pipeline to consulting stage gates:
-- outreach → applied → document_check → screening → rtr_rate → submission → client_shortlist → client_interview → offered → hired | rejected | withdrawn
-- Map existing statuses to the new set. Drop constraint first so UPDATEs to new values succeed, then re-add.

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

UPDATE public.applications SET status = 'rtr_rate' WHERE status IN ('rate_confirmation', 'right_to_represent');
UPDATE public.applications SET status = 'document_check' WHERE status IN ('reviewing', 'reviewed');
UPDATE public.applications SET status = 'submission' WHERE status = 'shortlisted';
UPDATE public.applications SET status = 'client_interview' WHERE status = 'interviewing';

ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'applied',
    'document_check',
    'screening',
    'rtr_rate',
    'submission',
    'client_shortlist',
    'client_interview',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
  )
);
