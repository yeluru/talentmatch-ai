-- Recruiter engagement workflow (tenant-scoped): rate confirmation → RTR → screening → submission → onboarding

CREATE TABLE IF NOT EXISTS public.candidate_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'rate_confirmation',
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (organization_id, candidate_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagements_stage_check') THEN
    ALTER TABLE public.candidate_engagements DROP CONSTRAINT candidate_engagements_stage_check;
  END IF;
END $$;

ALTER TABLE public.candidate_engagements
ADD CONSTRAINT candidate_engagements_stage_check
CHECK (stage IN (
  'rate_confirmation',
  'right_to_represent',
  'screening',
  'submission',
  'interview',
  'offer',
  'onboarding',
  'closed'
));

-- Simple updated_at trigger
DROP TRIGGER IF EXISTS trg_candidate_engagements_updated_at ON public.candidate_engagements;
CREATE TRIGGER trg_candidate_engagements_updated_at
BEFORE UPDATE ON public.candidate_engagements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.candidate_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters can manage candidate engagements" ON public.candidate_engagements;
CREATE POLICY "Recruiters can manage candidate engagements"
ON public.candidate_engagements
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND organization_id = get_user_organization(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);

