-- Hybrid job model: AM can create jobs and assign to recruiters; recruiters can create jobs (own only).
-- Recruiter sees: jobs they own (recruiter_id = me) + jobs assigned to them (job_recruiter_assignments).
-- AM sees: all org jobs. One recruiter-created job is visible only to that recruiter and to AM.

-- =============================================================================
-- 1) job_recruiter_assignments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_recruiter_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_recruiter_assignments_job_id ON public.job_recruiter_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_recruiter_assignments_user_id ON public.job_recruiter_assignments(user_id);

ALTER TABLE public.job_recruiter_assignments ENABLE ROW LEVEL SECURITY;

-- Account managers and org admins can manage assignments for jobs in their org
CREATE POLICY "AM and org admin can manage job recruiter assignments"
ON public.job_recruiter_assignments
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_recruiter_assignments.job_id
      AND j.organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_recruiter_assignments.job_id
      AND j.organization_id = get_user_organization(auth.uid())
  )
);

-- Recruiters can read their own assignments
CREATE POLICY "Recruiters can read own job assignments"
ON public.job_recruiter_assignments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND user_id = auth.uid()
);

-- Super admin can read all (for support)
CREATE POLICY "Super admins can read job recruiter assignments"
ON public.job_recruiter_assignments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================================================
-- 2) Jobs SELECT: recruiters see only own + assigned; AM/org_admin see all org
-- =============================================================================
DROP POLICY IF EXISTS "Jobs visibility rules" ON public.jobs;

CREATE POLICY "Jobs visibility rules"
ON public.jobs
FOR SELECT
USING (
  -- Public published: anyone
  (status = 'published' AND visibility = 'public')
  OR
  -- Recruiter: same org AND (owns job OR assigned to job)
  (
    auth.uid() IS NOT NULL
    AND has_role(auth.uid(), 'recruiter'::app_role)
    AND organization_id = get_user_organization(auth.uid())
    AND (
      recruiter_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.job_recruiter_assignments jra
        WHERE jra.job_id = jobs.id AND jra.user_id = auth.uid()
      )
    )
  )
  OR
  -- Account manager or org admin: all jobs in org
  (
    auth.uid() IS NOT NULL
    AND (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
    AND organization_id = get_user_organization(auth.uid())
  )
  OR
  -- Candidate: private published when linked to org
  (
    auth.uid() IS NOT NULL
    AND status = 'published'
    AND visibility = 'private'
    AND has_role(auth.uid(), 'candidate'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.candidate_org_ids_for_user(auth.uid()) org_id
      WHERE org_id = public.jobs.organization_id
    )
  )
);

-- =============================================================================
-- 3) Jobs INSERT: recruiter or AM, must set recruiter_id = self (owner)
-- =============================================================================
DROP POLICY IF EXISTS "Recruiters can manage jobs in their organization" ON public.jobs;

CREATE POLICY "Recruiters and AM can create jobs in their organization"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND organization_id = get_user_organization(auth.uid())
  AND recruiter_id = auth.uid()
);

-- =============================================================================
-- 4) Jobs UPDATE: owner or assigned recruiter (or AM/org_admin in org)
-- =============================================================================
DROP POLICY IF EXISTS "Recruiters can update jobs in their organization" ON public.jobs;

CREATE POLICY "Owner or assigned recruiter or AM can update job"
ON public.jobs
FOR UPDATE
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    recruiter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.job_recruiter_assignments jra WHERE jra.job_id = jobs.id AND jra.user_id = auth.uid())
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  )
);

-- =============================================================================
-- 5) Jobs DELETE: only owner (recruiter_id = self)
-- =============================================================================
DROP POLICY IF EXISTS "Recruiters can delete jobs in their organization" ON public.jobs;

CREATE POLICY "Only job owner can delete job"
ON public.jobs
FOR DELETE
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND recruiter_id = auth.uid()
);
