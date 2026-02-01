-- Allow account managers to view publicly discoverable (marketplace) candidates.
-- Recruiters already see them via "Recruiters can view candidates (org + marketplace)".
-- Managers only had "Account managers can view org candidates via links", so marketplace-only
-- candidates were invisible. This policy uses the same recruiter_can_view_marketplace_candidate
-- check (org must have marketplace_search_enabled; candidate must be opt-in + actively looking).

CREATE POLICY "Account managers can view marketplace candidates"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND public.recruiter_can_view_marketplace_candidate(id)
);
