-- Create archived users table to store user data before deletion
CREATE TABLE public.archived_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  archived_at timestamp with time zone NOT NULL DEFAULT now(),
  archived_by uuid NOT NULL,
  archive_reason text,
  user_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_data jsonb,
  roles_data jsonb,
  candidate_profile_data jsonb,
  applications_data jsonb,
  resumes_data jsonb
);

-- Enable RLS
ALTER TABLE public.archived_users ENABLE ROW LEVEL SECURITY;

-- Only super admins can view archived users
CREATE POLICY "Super admins can view archived users"
ON public.archived_users
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Only super admins can create archived users
CREATE POLICY "Super admins can create archived users"
ON public.archived_users
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- Create function to archive and delete a user
CREATE OR REPLACE FUNCTION public.archive_and_delete_user(_target_user_id uuid, _reason text DEFAULT 'Deleted by super admin')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _profile_record profiles%ROWTYPE;
  _candidate_profile_record candidate_profiles%ROWTYPE;
  _user_email text;
  _user_full_name text;
BEGIN
  -- Check if caller is super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can delete users';
  END IF;
  
  -- Prevent deleting yourself
  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Prevent deleting other super admins
  IF is_super_admin(_target_user_id) THEN
    RAISE EXCEPTION 'Cannot delete another super admin';
  END IF;
  
  -- Get profile data
  SELECT * INTO _profile_record FROM profiles WHERE user_id = _target_user_id;
  _user_email := COALESCE(_profile_record.email, 'unknown');
  _user_full_name := _profile_record.full_name;
  
  -- Get candidate profile if exists
  SELECT * INTO _candidate_profile_record FROM candidate_profiles WHERE user_id = _target_user_id;
  
  -- Archive the user data
  INSERT INTO archived_users (
    original_user_id,
    email,
    full_name,
    archived_by,
    archive_reason,
    user_data,
    profile_data,
    roles_data,
    candidate_profile_data,
    applications_data,
    resumes_data
  ) VALUES (
    _target_user_id,
    _user_email,
    _user_full_name,
    auth.uid(),
    _reason,
    jsonb_build_object('user_id', _target_user_id, 'archived_at', now()),
    to_jsonb(_profile_record),
    (SELECT jsonb_agg(to_jsonb(ur)) FROM user_roles ur WHERE ur.user_id = _target_user_id),
    to_jsonb(_candidate_profile_record),
    (SELECT jsonb_agg(to_jsonb(a)) FROM applications a WHERE a.candidate_id = _candidate_profile_record.id),
    (SELECT jsonb_agg(to_jsonb(r)) FROM resumes r WHERE r.candidate_id = _candidate_profile_record.id)
  );
  
  -- Delete user data in order (respecting foreign keys)
  -- Delete resumes
  DELETE FROM resumes WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete applications
  DELETE FROM applications WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete AI analyses
  DELETE FROM ai_resume_analyses WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete candidate skills, education, experience
  DELETE FROM candidate_skills WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  DELETE FROM candidate_education WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  DELETE FROM candidate_experience WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete shortlist entries
  DELETE FROM shortlist_candidates WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete campaign recipients
  DELETE FROM campaign_recipients WHERE candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = _target_user_id);
  
  -- Delete candidate profile
  DELETE FROM candidate_profiles WHERE user_id = _target_user_id;
  
  -- Delete job alerts
  DELETE FROM job_alerts WHERE user_id = _target_user_id;
  
  -- Delete notifications
  DELETE FROM notifications WHERE user_id = _target_user_id;
  
  -- Delete user suspensions
  DELETE FROM user_suspensions WHERE user_id = _target_user_id;
  
  -- Delete user roles
  DELETE FROM user_roles WHERE user_id = _target_user_id;
  
  -- Delete profile
  DELETE FROM profiles WHERE user_id = _target_user_id;
  
  RETURN true;
END;
$$;