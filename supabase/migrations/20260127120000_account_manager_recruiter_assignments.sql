-- Account Manager ↔ Recruiter assignments
-- Model: 1 account manager → many recruiters; each recruiter belongs to at most 1 account manager per org.

CREATE TABLE IF NOT EXISTS public.account_manager_recruiter_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (organization_id, recruiter_user_id)
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_am_recruiter_assignments_updated_at ON public.account_manager_recruiter_assignments;
CREATE TRIGGER trg_am_recruiter_assignments_updated_at
BEFORE UPDATE ON public.account_manager_recruiter_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_manager_recruiter_assignments ENABLE ROW LEVEL SECURITY;

-- Org admins can manage assignments for their org
DROP POLICY IF EXISTS "Org admins can manage AM recruiter assignments" ON public.account_manager_recruiter_assignments;
CREATE POLICY "Org admins can manage AM recruiter assignments"
ON public.account_manager_recruiter_assignments
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND organization_id = get_user_organization(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);

-- Account managers can read their own assignments
DROP POLICY IF EXISTS "Account managers can read assigned recruiters" ON public.account_manager_recruiter_assignments;
CREATE POLICY "Account managers can read assigned recruiters"
ON public.account_manager_recruiter_assignments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND organization_id = get_user_organization(auth.uid())
  AND account_manager_user_id = auth.uid()
);

-- Recruiters can read who they are assigned to
DROP POLICY IF EXISTS "Recruiters can read their assignment" ON public.account_manager_recruiter_assignments;
CREATE POLICY "Recruiters can read their assignment"
ON public.account_manager_recruiter_assignments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND recruiter_user_id = auth.uid()
);


-- Engagement ownership (used for AM oversight dashboards)
ALTER TABLE public.candidate_engagements
ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill owner to created_by where possible
UPDATE public.candidate_engagements
SET owner_user_id = created_by
WHERE owner_user_id IS NULL
  AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_engagements_owner
ON public.candidate_engagements (organization_id, owner_user_id);

-- Expand engagement RLS to include account managers (they oversee and can override)
DROP POLICY IF EXISTS "Recruiters can manage candidate engagements" ON public.candidate_engagements;
CREATE POLICY "Staff can manage candidate engagements"
ON public.candidate_engagements
FOR ALL
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  )
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  )
);

-- Allow account managers to manage engagement requests in their org (same policy as recruiters)
DROP POLICY IF EXISTS "Recruiters can manage engagement requests" ON public.candidate_engagement_requests;
CREATE POLICY "Staff can manage engagement requests"
ON public.candidate_engagement_requests
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND e.organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND EXISTS (
    SELECT 1
    FROM public.candidate_engagements e
    WHERE e.id = candidate_engagement_requests.engagement_id
      AND e.organization_id = get_user_organization(auth.uid())
  )
);

