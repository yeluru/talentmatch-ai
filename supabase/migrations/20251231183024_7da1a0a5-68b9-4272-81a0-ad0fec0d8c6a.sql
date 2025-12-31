-- Create table for recruiter invites
CREATE TABLE public.recruiter_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.recruiter_invites ENABLE ROW LEVEL SECURITY;

-- Managers can manage invites for their org
CREATE POLICY "Managers can view org invites"
ON public.recruiter_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'account_manager')
);

CREATE POLICY "Managers can create org invites"
ON public.recruiter_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'account_manager')
);

CREATE POLICY "Managers can update org invites"
ON public.recruiter_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'account_manager')
);

CREATE POLICY "Managers can delete org invites"
ON public.recruiter_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'account_manager')
);

-- Create function for managers to remove recruiters from org
CREATE OR REPLACE FUNCTION public.remove_recruiter_from_org(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is a manager in the same org
  IF NOT has_role(auth.uid(), 'account_manager') THEN
    RAISE EXCEPTION 'Only account managers can remove recruiters';
  END IF;
  
  -- Check if target is a recruiter in the same org
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id 
    AND role = 'recruiter'
    AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'User is not a recruiter in your organization';
  END IF;
  
  -- Delete the user role (this removes them from org)
  DELETE FROM user_roles 
  WHERE user_id = _user_id 
  AND role = 'recruiter'
  AND organization_id = get_user_organization(auth.uid());
END;
$$;

-- Create function to add recruiter role (for invite acceptance)
CREATE OR REPLACE FUNCTION public.accept_recruiter_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record recruiter_invites%ROWTYPE;
  org_id uuid;
BEGIN
  -- Find the invite
  SELECT * INTO invite_record
  FROM recruiter_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();
    
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  org_id := invite_record.organization_id;
  
  -- Update invite status
  UPDATE recruiter_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;
  
  -- Insert the recruiter role for current user
  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'recruiter', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN org_id;
END;
$$;

-- Allow managers to view all user_roles in their org (for team management)
CREATE POLICY "Managers can view org user roles"
ON public.user_roles
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (auth.uid() = user_id OR has_role(auth.uid(), 'account_manager'))
);

-- Update profiles policy to allow managers to view team member profiles
DROP POLICY IF EXISTS "Recruiters can view profiles of accessible candidates" ON public.profiles;

CREATE POLICY "Users can view relevant profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (has_role(auth.uid(), 'recruiter') AND user_id IN (
    SELECT cp.user_id FROM candidate_profiles cp WHERE recruiter_can_access_candidate(cp.id)
  ))
  OR (has_role(auth.uid(), 'account_manager') AND user_id IN (
    SELECT ur.user_id FROM user_roles ur WHERE ur.organization_id = get_user_organization(auth.uid())
  ))
);

-- Track recruiter activity (jobs posted by recruiter)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_by UUID;

-- Update existing jobs to have created_by = recruiter_id where null
UPDATE public.jobs SET created_by = recruiter_id WHERE created_by IS NULL;