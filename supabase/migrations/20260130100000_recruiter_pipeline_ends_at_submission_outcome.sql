-- Recruiter pipeline ends at Submission; after that one stage "Outcome" (final_update) with sub-values.
-- Manager pipeline (future) starts at Submission. Applications get outcome when recruiter records manager feedback.

-- 1) Add outcome column (nullable; set when status = final_update)
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS outcome TEXT;

COMMENT ON COLUMN public.applications.outcome IS 'When status=final_update: client_rejected, job_offered, candidate_declined, withdrawn, hired';

-- 2) Drop existing status check constraint
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

-- 3) Map old statuses to final_update + outcome (and any other legacy values to a valid stage)
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'rejected';
UPDATE public.applications SET status = 'final_update', outcome = 'withdrawn' WHERE status = 'withdrawn';
UPDATE public.applications SET status = 'final_update', outcome = 'job_offered' WHERE status = 'offered';
UPDATE public.applications SET status = 'final_update', outcome = 'hired' WHERE status = 'hired';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'client_shortlist';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'client_interview';
-- Legacy values from older migrations (if any rows still have them)
UPDATE public.applications SET status = 'rtr_rate' WHERE status IN ('rate_confirmation', 'right_to_represent');
UPDATE public.applications SET status = 'document_check' WHERE status IN ('reviewing', 'reviewed');
UPDATE public.applications SET status = 'submission' WHERE status = 'shortlisted';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status IN ('interviewing', 'interview');
UPDATE public.applications SET status = 'final_update', outcome = NULL WHERE status NOT IN ('outreach','applied','rtr_rate','document_check','screening','submission','final_update');

-- 4) Re-add constraint: recruiter pipeline statuses only
ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'applied',
    'rtr_rate',
    'document_check',
    'screening',
    'submission',
    'final_update'
  )
);

-- 5) Optional: check outcome when status is final_update (allow null for "pending")
ALTER TABLE public.applications
ADD CONSTRAINT applications_outcome_check
CHECK (
  (status <> 'final_update' AND outcome IS NULL)
  OR
  (status = 'final_update' AND (outcome IS NULL OR outcome IN ('client_rejected','job_offered','candidate_declined','withdrawn','hired')))
);

CREATE INDEX IF NOT EXISTS idx_applications_outcome ON public.applications(outcome) WHERE outcome IS NOT NULL;
