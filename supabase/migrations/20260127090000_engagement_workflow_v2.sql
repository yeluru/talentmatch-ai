-- Engagement workflow v2:
-- - Make engagements job-scoped (org ↔ candidate ↔ job)
-- - Add engagement requests (RTR, rate confirmation, offer, etc.) that drive stage transitions via email + candidate actions
-- - Add a safe "claim by email" helper so sourced candidates can sign up and access their requests

-- 1) candidate_engagements: extend schema
ALTER TABLE public.candidate_engagements
ADD COLUMN IF NOT EXISTS job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE public.candidate_engagements
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.candidate_engagements
ADD COLUMN IF NOT EXISTS source text NULL;

ALTER TABLE public.candidate_engagements
ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone NOT NULL DEFAULT now();

DO $$
BEGIN
  -- Relax stage check constraint to allow flexible/custom stages without migrations.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagements_stage_check') THEN
    ALTER TABLE public.candidate_engagements DROP CONSTRAINT candidate_engagements_stage_check;
  END IF;
END $$;

-- Replace with a minimal constraint: non-empty stage
ALTER TABLE public.candidate_engagements
ADD CONSTRAINT candidate_engagements_stage_nonempty_check
CHECK (char_length(trim(stage)) > 0);

-- 2) Add a job-scoped uniqueness guarantee (only when job_id is present)
DO $$
BEGIN
  -- Drop legacy unique constraint (org_id, candidate_id) so we can support per-job engagements.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagements_organization_id_candidate_id_key') THEN
    ALTER TABLE public.candidate_engagements DROP CONSTRAINT candidate_engagements_organization_id_candidate_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'candidate_engagements_org_candidate_job_uniq') THEN
    DROP INDEX public.candidate_engagements_org_candidate_job_uniq;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'candidate_engagements_org_candidate_legacy_uniq') THEN
    DROP INDEX public.candidate_engagements_org_candidate_legacy_uniq;
  END IF;
END $$;

-- Preserve at-most-one legacy engagement without a job
CREATE UNIQUE INDEX candidate_engagements_org_candidate_legacy_uniq
ON public.candidate_engagements (organization_id, candidate_id)
WHERE job_id IS NULL;

CREATE UNIQUE INDEX candidate_engagements_org_candidate_job_uniq
ON public.candidate_engagements (organization_id, candidate_id, job_id)
WHERE job_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagements_status_check') THEN
    ALTER TABLE public.candidate_engagements DROP CONSTRAINT candidate_engagements_status_check;
  END IF;
END $$;

ALTER TABLE public.candidate_engagements
ADD CONSTRAINT candidate_engagements_status_check
CHECK (status IN ('active', 'paused', 'closed'));


-- 3) Engagement requests (email-driven actions that candidates can accept/counter)
CREATE TABLE IF NOT EXISTS public.candidate_engagement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.candidate_engagements(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  to_email text NULL,
  subject text NULL,
  body text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone NULL,
  responded_at timestamp with time zone NULL
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagement_requests_status_check') THEN
    ALTER TABLE public.candidate_engagement_requests DROP CONSTRAINT candidate_engagement_requests_status_check;
  END IF;
END $$;

ALTER TABLE public.candidate_engagement_requests
ADD CONSTRAINT candidate_engagement_requests_status_check
CHECK (status IN ('draft', 'queued', 'sent', 'viewed', 'accepted', 'rejected', 'countered', 'expired', 'cancelled'));

ALTER TABLE public.candidate_engagement_requests ENABLE ROW LEVEL SECURITY;

-- Recruiters can manage requests for their org engagements
DROP POLICY IF EXISTS "Recruiters can manage engagement requests" ON public.candidate_engagement_requests;
CREATE POLICY "Recruiters can manage engagement requests"
ON public.candidate_engagement_requests
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND e.organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND e.organization_id = get_user_organization(auth.uid())
  )
);

-- Candidates can read/update their own requests (by matching candidate_profiles.user_id)
DROP POLICY IF EXISTS "Candidates can read their engagement requests" ON public.candidate_engagement_requests;
CREATE POLICY "Candidates can read their engagement requests"
ON public.candidate_engagement_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'candidate'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    JOIN public.candidate_profiles cp ON cp.id = e.candidate_id
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Candidates can respond to their engagement requests" ON public.candidate_engagement_requests;
CREATE POLICY "Candidates can respond to their engagement requests"
ON public.candidate_engagement_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'candidate'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    JOIN public.candidate_profiles cp ON cp.id = e.candidate_id
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'candidate'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    JOIN public.candidate_profiles cp ON cp.id = e.candidate_id
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND cp.user_id = auth.uid()
  )
);


-- 4) Claim helper (sourced candidates): link existing candidate_profiles row to the logged-in candidate user by email.
-- This lets a candidate sign up/sign in and immediately access engagement requests sent to their email.
CREATE OR REPLACE FUNCTION public.claim_candidate_profile_by_email()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text;
  claimed_id uuid;
BEGIN
  jwt_email := lower(trim((auth.jwt() ->> 'email')));
  IF jwt_email IS NULL OR jwt_email = '' THEN
    RETURN NULL;
  END IF;

  -- If the user already has a candidate_profile, return it.
  SELECT cp.id INTO claimed_id
  FROM public.candidate_profiles cp
  WHERE cp.user_id = auth.uid()
  ORDER BY cp.updated_at DESC NULLS LAST
  LIMIT 1;

  IF claimed_id IS NOT NULL THEN
    RETURN claimed_id;
  END IF;

  -- Otherwise, claim the most recently updated sourced profile with matching email.
  UPDATE public.candidate_profiles cp
  SET user_id = auth.uid()
  WHERE cp.user_id IS NULL
    AND lower(trim(cp.email)) = jwt_email
    AND cp.id = (
      SELECT cp2.id
      FROM public.candidate_profiles cp2
      WHERE cp2.user_id IS NULL
        AND lower(trim(cp2.email)) = jwt_email
      ORDER BY cp2.updated_at DESC NULLS LAST, cp2.created_at DESC NULLS LAST
      LIMIT 1
    )
  RETURNING cp.id INTO claimed_id;

  RETURN claimed_id;
END;
$$;

