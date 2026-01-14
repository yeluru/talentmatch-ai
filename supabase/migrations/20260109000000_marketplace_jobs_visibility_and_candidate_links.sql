-- Marketplace + tenant-scoped jobs
-- - Jobs can be private (tenant-only) or public (marketplace)
-- - Candidates can opt-in to be discoverable (marketplace)
-- - Candidate-to-org is many-to-many via candidate_org_links
-- - Recruiter access to candidates uses links/applications/shortlists + optional marketplace opt-in

-- ----------------------------------------
-- 1) Jobs visibility + org defaults
-- ----------------------------------------

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_visibility_check') THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_visibility_check;
  END IF;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_visibility_check
CHECK (visibility IN ('private', 'public'));

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS default_job_visibility text NOT NULL DEFAULT 'private',
ADD COLUMN IF NOT EXISTS marketplace_search_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_default_job_visibility_check') THEN
    ALTER TABLE public.organizations DROP CONSTRAINT organizations_default_job_visibility_check;
  END IF;
END $$;

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_default_job_visibility_check
CHECK (default_job_visibility IN ('private', 'public'));


-- ----------------------------------------
-- 2) Candidate marketplace consent
-- ----------------------------------------

ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS marketplace_opt_in boolean NOT NULL DEFAULT false;

-- Optional: coarse-grained visibility level for future use
ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS marketplace_visibility_level text NOT NULL DEFAULT 'anonymous';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_profiles_marketplace_visibility_level_check') THEN
    ALTER TABLE public.candidate_profiles DROP CONSTRAINT candidate_profiles_marketplace_visibility_level_check;
  END IF;
END $$;

ALTER TABLE public.candidate_profiles
ADD CONSTRAINT candidate_profiles_marketplace_visibility_level_check
CHECK (marketplace_visibility_level IN ('anonymous', 'limited', 'full'));


-- ----------------------------------------
-- 3) Candidate ↔ Organization links (many-to-many)
-- ----------------------------------------

CREATE TABLE IF NOT EXISTS public.candidate_org_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(candidate_id, organization_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_org_links_status_check') THEN
    ALTER TABLE public.candidate_org_links DROP CONSTRAINT candidate_org_links_status_check;
  END IF;
END $$;

ALTER TABLE public.candidate_org_links
ADD CONSTRAINT candidate_org_links_status_check
CHECK (status IN ('active', 'inactive'));

-- Backfill links from legacy candidate_profiles.organization_id if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidate_profiles'
      AND column_name = 'organization_id'
  ) THEN
    INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_at)
    SELECT cp.id, cp.organization_id, 'legacy_org_id', 'active', now()
    FROM public.candidate_profiles cp
    WHERE cp.organization_id IS NOT NULL
    ON CONFLICT (candidate_id, organization_id) DO NOTHING;
  END IF;
END $$;


-- ----------------------------------------
-- 4) Helper functions
-- ----------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_is_linked_to_org(_candidate_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = _candidate_id
      AND col.organization_id = _org_id
      AND col.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.candidate_org_ids_for_user(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT col.organization_id
  FROM public.candidate_org_links col
  JOIN public.candidate_profiles cp ON cp.id = col.candidate_id
  WHERE cp.user_id = _user_id
    AND col.status = 'active';
$$;


-- ----------------------------------------
-- 5) Update recruiter access helper (uses links instead of candidate_profiles.organization_id)
-- ----------------------------------------

CREATE OR REPLACE FUNCTION public.recruiter_can_access_candidate(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Candidate is linked to recruiter's org (talent pool)
    public.candidate_is_linked_to_org(_candidate_id, get_user_organization(auth.uid()))
  OR EXISTS (
    -- Candidate applied to recruiter's org jobs
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.candidate_id = _candidate_id
      AND j.organization_id = get_user_organization(auth.uid())
  )
  OR EXISTS (
    -- Candidate is in recruiter's org shortlists
    SELECT 1 FROM public.shortlist_candidates sc
    JOIN public.candidate_shortlists cs ON cs.id = sc.shortlist_id
    WHERE sc.candidate_id = _candidate_id
      AND cs.organization_id = get_user_organization(auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.recruiter_can_view_marketplace_candidate(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_profiles cp
    WHERE cp.id = _candidate_id
      AND cp.marketplace_opt_in = true
      AND cp.is_actively_looking = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = get_user_organization(auth.uid())
      AND o.marketplace_search_enabled = true
  );
$$;


-- ----------------------------------------
-- 6) Jobs SELECT policy: public vs private
-- ----------------------------------------

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can view published jobs and org jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can view jobs from their organization" ON public.jobs;
DROP POLICY IF EXISTS "Published jobs are viewable by all authenticated users" ON public.jobs;

-- Anyone can see public published jobs.
-- Recruiters/managers/org_admins can see all jobs in their org.
-- Candidates can see:
--   - public published jobs
--   - private published jobs only if linked to that org (candidate_org_links)
CREATE POLICY "Jobs visibility rules"
ON public.jobs
FOR SELECT
USING (
  (
    status = 'published'
    AND visibility = 'public'
  )
  OR (
    auth.uid() IS NOT NULL
    AND organization_id = get_user_organization(auth.uid())
  )
  OR (
    auth.uid() IS NOT NULL
    AND status = 'published'
    AND visibility = 'private'
    AND has_role(auth.uid(), 'candidate'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.candidate_org_ids_for_user(auth.uid()) org_id
      WHERE org_id = public.jobs.organization_id
    )
  )
);


-- ----------------------------------------
-- 7) Candidate marketplace RLS expansions (skills/experience)
-- ----------------------------------------

-- candidate_profiles: recruiters can view org-accessible candidates OR marketplace candidates (opt-in)
DROP POLICY IF EXISTS "Recruiters can view accessible candidates" ON public.candidate_profiles;
CREATE POLICY "Recruiters can view candidates (org + marketplace)"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND (
      public.recruiter_can_access_candidate(id)
      OR public.recruiter_can_view_marketplace_candidate(id)
    )
  )
);

-- candidate_skills: recruiters can view skills for org candidates OR marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view skills of accessible candidates" ON public.candidate_skills;
CREATE POLICY "Recruiters can view candidate skills (org + marketplace)"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

-- candidate_experience: recruiters can view experience for org candidates OR marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view experience of accessible candidates" ON public.candidate_experience;
CREATE POLICY "Recruiters can view candidate experience (org + marketplace)"
ON public.candidate_experience
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

