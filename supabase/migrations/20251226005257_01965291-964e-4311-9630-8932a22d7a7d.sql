-- Add organization_id to candidate_profiles (candidates can belong to an org)
ALTER TABLE public.candidate_profiles 
ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Create invite codes table for organization invitations
CREATE TABLE public.organization_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code varchar(20) NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  max_uses integer DEFAULT NULL, -- NULL means unlimited
  uses_count integer DEFAULT 0,
  expires_at timestamp with time zone DEFAULT NULL, -- NULL means never expires
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_invite_codes ENABLE ROW LEVEL SECURITY;

-- Organization members can view their org's invite codes
CREATE POLICY "Organization members can view invite codes"
ON public.organization_invite_codes
FOR SELECT
TO authenticated
USING (organization_id = get_user_organization(auth.uid()));

-- Recruiters and managers can create invite codes
CREATE POLICY "Recruiters and managers can create invite codes"
ON public.organization_invite_codes
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager'))
);

-- Recruiters and managers can update invite codes (deactivate)
CREATE POLICY "Recruiters and managers can update invite codes"
ON public.organization_invite_codes
FOR UPDATE
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager'))
);

-- Recruiters and managers can delete invite codes
CREATE POLICY "Recruiters and managers can delete invite codes"
ON public.organization_invite_codes
FOR DELETE
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager'))
);

-- Create a function to validate and use invite code (for candidates during signup)
CREATE OR REPLACE FUNCTION public.use_invite_code(invite_code varchar)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_record organization_invite_codes%ROWTYPE;
BEGIN
  -- Find the invite code
  SELECT * INTO code_record
  FROM organization_invite_codes
  WHERE code = invite_code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses_count < max_uses);
    
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Increment uses count
  UPDATE organization_invite_codes
  SET uses_count = uses_count + 1
  WHERE id = code_record.id;
  
  RETURN code_record.organization_id;
END;
$$;

-- Function to generate random invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS varchar
LANGUAGE plpgsql
AS $$
DECLARE
  chars varchar := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code varchar := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- Update RLS policy for jobs - candidates should only see jobs from their org
DROP POLICY IF EXISTS "Published jobs are viewable by all authenticated users" ON public.jobs;

-- Candidates can only see jobs from their org, recruiters see their org jobs
CREATE POLICY "Users can view jobs from their organization"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  status = 'published' AND (
    -- Recruiters/managers see their org's jobs
    organization_id = get_user_organization(auth.uid())
    OR 
    -- Candidates see jobs from their org
    organization_id IN (
      SELECT cp.organization_id 
      FROM candidate_profiles cp 
      WHERE cp.user_id = auth.uid() 
      AND cp.organization_id IS NOT NULL
    )
  )
  OR 
  -- Org members always see their own jobs (even drafts)
  organization_id = get_user_organization(auth.uid())
);