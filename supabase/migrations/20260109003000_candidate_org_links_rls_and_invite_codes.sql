-- candidate_org_links RLS + invite code validation/consumption + automatic application linking

ALTER TABLE public.candidate_org_links ENABLE ROW LEVEL SECURITY;

-- Helper to get candidate_profile id for an auth user
CREATE OR REPLACE FUNCTION public.candidate_profile_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.candidate_profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Candidate_org_links SELECT:
-- - candidate can see their own links
-- - org staff can see links for their org
DROP POLICY IF EXISTS "Candidate org links are readable" ON public.candidate_org_links;
CREATE POLICY "Candidate org links are readable"
ON public.candidate_org_links
FOR SELECT
TO authenticated
USING (
  candidate_id = public.candidate_profile_id_for_user(auth.uid())
  OR organization_id = get_user_organization(auth.uid())
);

-- Candidate_org_links INSERT:
-- - candidate can create link for themselves (used after invite/apply)
-- - recruiter/org_admin can create links within their org (used for engagement)
DROP POLICY IF EXISTS "Candidate org links insert" ON public.candidate_org_links;
CREATE POLICY "Candidate org links insert"
ON public.candidate_org_links
FOR INSERT
TO authenticated
WITH CHECK (
  (
    candidate_id = public.candidate_profile_id_for_user(auth.uid())
  )
  OR (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  )
);

-- Candidate_org_links UPDATE:
-- - candidate can deactivate their own link (future)
-- - org_admin can deactivate links in their org
DROP POLICY IF EXISTS "Candidate org links update" ON public.candidate_org_links;
CREATE POLICY "Candidate org links update"
ON public.candidate_org_links
FOR UPDATE
TO authenticated
USING (
  candidate_id = public.candidate_profile_id_for_user(auth.uid())
  OR (has_role(auth.uid(), 'org_admin'::app_role) AND organization_id = get_user_organization(auth.uid()))
)
WITH CHECK (
  candidate_id = public.candidate_profile_id_for_user(auth.uid())
  OR (has_role(auth.uid(), 'org_admin'::app_role) AND organization_id = get_user_organization(auth.uid()))
);


-- ----------------------------------------
-- Invite code: validate (no consume) + consume (increments and returns org)
-- ----------------------------------------

CREATE OR REPLACE FUNCTION public.validate_invite_code(invite_code varchar)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_record organization_invite_codes%ROWTYPE;
BEGIN
  SELECT * INTO code_record
  FROM organization_invite_codes
  WHERE code = invite_code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses_count < max_uses);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN code_record.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_invite_code(invite_code varchar)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_record organization_invite_codes%ROWTYPE;
  org_id uuid;
  cp_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO code_record
  FROM organization_invite_codes
  WHERE code = invite_code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses_count < max_uses);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  org_id := code_record.organization_id;
  cp_id := public.candidate_profile_id_for_user(auth.uid());

  IF cp_id IS NULL THEN
    -- Candidate profile should exist by now; create defensively.
    INSERT INTO public.candidate_profiles (user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
    cp_id := public.candidate_profile_id_for_user(auth.uid());
  END IF;

  -- If already linked, don't consume again
  IF EXISTS (
    SELECT 1 FROM public.candidate_org_links
    WHERE candidate_id = cp_id AND organization_id = org_id AND status = 'active'
  ) THEN
    RETURN org_id;
  END IF;

  UPDATE organization_invite_codes
  SET uses_count = uses_count + 1
  WHERE id = code_record.id;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, org_id, 'invite_code', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE SET status = 'active';

  RETURN org_id;
END;
$$;


-- ----------------------------------------
-- Automatically link candidate ↔ org on application insert
-- ----------------------------------------

CREATE OR REPLACE FUNCTION public.link_candidate_to_job_org_on_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  SELECT organization_id INTO org_id FROM public.jobs WHERE id = NEW.job_id;
  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (NEW.candidate_id, org_id, 'application', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE SET status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_link_candidate_org ON public.applications;
CREATE TRIGGER trg_applications_link_candidate_org
AFTER INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.link_candidate_to_job_org_on_apply();

