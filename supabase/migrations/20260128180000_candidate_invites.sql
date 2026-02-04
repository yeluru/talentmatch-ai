-- Org admins can invite candidates by email (same pattern as manager/recruiter invites).
-- Invitee signs up as candidate and is linked to the org via candidate_org_links.

CREATE TABLE IF NOT EXISTS public.candidate_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.candidate_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view org candidate invites"
ON public.candidate_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can create candidate invites"
ON public.candidate_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can update candidate invites"
ON public.candidate_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can delete candidate invites"
ON public.candidate_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

-- Accept candidate invite: link the signed-in user to the org as a candidate (profile + candidate_profile + candidate_org_links).
CREATE OR REPLACE FUNCTION public.accept_candidate_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  invite_record public.candidate_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
  cp_id uuid;
  inferred_name text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM public.candidate_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RAISE EXCEPTION 'Invite email does not match signed-in user';
  END IF;

  org_id := invite_record.organization_id;
  inferred_name := COALESCE(NULLIF(trim(invite_record.full_name), ''), split_part(invite_record.email, '@', 1), 'Candidate');

  UPDATE public.candidate_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  -- Ensure profiles row exists
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (auth.uid(), invite_record.email, inferred_name)
  ON CONFLICT (user_id) DO UPDATE SET full_name = COALESCE(NULLIF(trim(public.profiles.full_name), ''), inferred_name);

  -- Ensure candidate_profile exists
  INSERT INTO public.candidate_profiles (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = auth.uid();

  -- Link candidate to org
  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, org_id, 'org_admin_invite', 'active', invite_record.invited_by)
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'org_admin_invite', created_by = invite_record.invited_by;

  RETURN org_id;
END;
$$;

-- Audit trigger for candidate_invites
DROP TRIGGER IF EXISTS audit_candidate_invites_write ON public.candidate_invites;
CREATE TRIGGER audit_candidate_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();
