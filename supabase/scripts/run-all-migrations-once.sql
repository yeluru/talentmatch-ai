-- Run-all-migrations-once.sql
-- All timestamped migrations from supabase/migrations/ concatenated in order.
-- Use in Studio (localhost:54323) → SQL Editor: paste this file and Run.
-- WARNING: On an existing DB that already has some migrations applied, this will
-- hit "already exists" errors. Use only on a fresh DB (e.g. after clear-all-data
-- or db reset), or run only the migration files you haven't applied yet.

-- === 20251225221210_0cb733c6-7340-4b69-8b0b-047a8eda7522.sql ===
-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('candidate', 'recruiter', 'account_manager');

-- Create profiles table for additional user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  avatar_url TEXT,
  bio TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  organization_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create organizations table for recruiters and account managers
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  industry TEXT,
  size TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update user_roles to reference organizations
ALTER TABLE public.user_roles 
ADD CONSTRAINT fk_user_roles_organization 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create candidate_profiles table for job seekers
CREATE TABLE public.candidate_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  headline TEXT,
  summary TEXT,
  years_of_experience INTEGER DEFAULT 0,
  current_title TEXT,
  current_company TEXT,
  desired_salary_min INTEGER,
  desired_salary_max INTEGER,
  desired_job_types TEXT[] DEFAULT '{}',
  desired_locations TEXT[] DEFAULT '{}',
  is_open_to_remote BOOLEAN DEFAULT true,
  is_actively_looking BOOLEAN DEFAULT true,
  profile_completeness INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create candidate_skills table
CREATE TABLE public.candidate_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  proficiency_level TEXT CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  years_of_experience INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create candidate_experience table
CREATE TABLE public.candidate_experience (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create candidate_education table
CREATE TABLE public.candidate_education (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  field_of_study TEXT,
  start_date DATE,
  end_date DATE,
  gpa DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create resumes table
CREATE TABLE public.resumes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  parsed_content JSONB,
  ats_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT,
  responsibilities TEXT,
  location TEXT,
  job_type TEXT CHECK (job_type IN ('full_time', 'part_time', 'contract', 'internship', 'remote')),
  experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'lead', 'executive')),
  salary_min INTEGER,
  salary_max INTEGER,
  required_skills TEXT[] DEFAULT '{}',
  nice_to_have_skills TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'filled')),
  is_remote BOOLEAN DEFAULT false,
  posted_at TIMESTAMP WITH TIME ZONE,
  closes_at TIMESTAMP WITH TIME ZONE,
  views_count INTEGER DEFAULT 0,
  applications_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create applications table
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'reviewed', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn')),
  cover_letter TEXT,
  ai_match_score INTEGER,
  ai_match_details JSONB,
  recruiter_notes TEXT,
  recruiter_rating INTEGER CHECK (recruiter_rating >= 1 AND recruiter_rating <= 5),
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_id, candidate_id)
);

-- Create ai_resume_analyses table
CREATE TABLE public.ai_resume_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_description_text TEXT,
  match_score INTEGER,
  matched_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  full_analysis JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('application_update', 'new_match', 'interview', 'message', 'system')),
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_resume_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own roles" ON public.user_roles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Organizations policies
CREATE POLICY "Organization members can view their organization" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Account managers can update their organization" ON public.organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'account_manager')
  );

CREATE POLICY "Anyone can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (true);

-- Candidate profiles policies
CREATE POLICY "Candidates can manage their own profile" ON public.candidate_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Recruiters can view candidate profiles for their job applicants" ON public.candidate_profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter') AND
    id IN (
      SELECT a.candidate_id FROM public.applications a
      JOIN public.jobs j ON a.job_id = j.id
      WHERE j.organization_id = public.get_user_organization(auth.uid())
    )
  );

-- Candidate skills policies
CREATE POLICY "Candidates can manage their own skills" ON public.candidate_skills
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Recruiters can view skills of applicants" ON public.candidate_skills
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter')
  );

-- Candidate experience policies
CREATE POLICY "Candidates can manage their own experience" ON public.candidate_experience
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Recruiters can view experience of applicants" ON public.candidate_experience
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter')
  );

-- Candidate education policies
CREATE POLICY "Candidates can manage their own education" ON public.candidate_education
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Recruiters can view education of applicants" ON public.candidate_education
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter')
  );

-- Resumes policies
CREATE POLICY "Candidates can manage their own resumes" ON public.resumes
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Recruiters can view resumes of applicants" ON public.resumes
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter')
  );

-- Jobs policies
CREATE POLICY "Published jobs are viewable by all authenticated users" ON public.jobs
  FOR SELECT USING (
    status = 'published' OR
    organization_id = public.get_user_organization(auth.uid())
  );

CREATE POLICY "Recruiters can manage jobs in their organization" ON public.jobs
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'recruiter') AND
    organization_id = public.get_user_organization(auth.uid())
  );

CREATE POLICY "Recruiters can update jobs in their organization" ON public.jobs
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'recruiter') AND
    organization_id = public.get_user_organization(auth.uid())
  );

CREATE POLICY "Recruiters can delete jobs in their organization" ON public.jobs
  FOR DELETE USING (
    public.has_role(auth.uid(), 'recruiter') AND
    organization_id = public.get_user_organization(auth.uid())
  );

-- Applications policies
CREATE POLICY "Candidates can view their own applications" ON public.applications
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can create applications" ON public.applications
  FOR INSERT WITH CHECK (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can update their own applications" ON public.applications
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Recruiters can view applications for their organization jobs" ON public.applications
  FOR SELECT USING (
    public.has_role(auth.uid(), 'recruiter') AND
    job_id IN (SELECT id FROM public.jobs WHERE organization_id = public.get_user_organization(auth.uid()))
  );

CREATE POLICY "Recruiters can update applications for their organization jobs" ON public.applications
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'recruiter') AND
    job_id IN (SELECT id FROM public.jobs WHERE organization_id = public.get_user_organization(auth.uid()))
  );

-- AI Resume Analyses policies
CREATE POLICY "Candidates can view their own analyses" ON public.ai_resume_analyses
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can create analyses" ON public.ai_resume_analyses
  FOR INSERT WITH CHECK (
    candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  );

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_profiles_updated_at
  BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_jobs_organization ON public.jobs(organization_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_recruiter ON public.jobs(recruiter_id);
CREATE INDEX idx_applications_job ON public.applications(job_id);
CREATE INDEX idx_applications_candidate ON public.applications(candidate_id);
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_candidate_skills_candidate ON public.candidate_skills(candidate_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);

-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);

-- Storage policies for resumes
CREATE POLICY "Users can upload their own resumes" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own resumes" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Recruiters can view applicant resumes" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes' AND
    public.has_role(auth.uid(), 'recruiter')
  );

-- === 20251226004322_94dd6ba2-ac0e-40c2-9d09-b72bae9385c8.sql ===
-- Fix organizations INSERT policy (change from RESTRICTIVE to PERMISSIVE)
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;
CREATE POLICY "Anyone can create organizations" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Fix candidate_profiles policies
DROP POLICY IF EXISTS "Candidates can manage their own profile" ON public.candidate_profiles;

-- Create separate policies for each operation to avoid issues
CREATE POLICY "Candidates can view their own profile"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Candidates can insert their own profile"
ON public.candidate_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Candidates can update their own profile"
ON public.candidate_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Candidates can delete their own profile"
ON public.candidate_profiles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Keep recruiter view policy but ensure it's permissive
DROP POLICY IF EXISTS "Recruiters can view candidate profiles for their job applicants" ON public.candidate_profiles;
CREATE POLICY "Recruiters can view candidate profiles"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  OR auth.uid() = user_id
);

-- === 20251226005257_01965291-964e-4311-9630-8932a22d7a7d.sql ===
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

-- === 20251226005530_880a3a12-24c5-4187-94f0-13c0499174dd.sql ===
-- Fix function search path for generate_invite_code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS varchar
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

-- === 20251226025747_26e2d906-067a-46f8-98a9-06542aa8790d.sql ===

-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;

CREATE POLICY "Anyone can create organizations" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (true);


-- === 20251226030012_77c6420e-aa9b-4688-9485-e79d5e1d308c.sql ===

-- Update the user_roles INSERT policy to be more permissive during signup
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

CREATE POLICY "Users can insert their own roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Also allow service role / immediate post-signup inserts
-- The issue is timing - we need to allow the insert right after signup
-- Let's make the policy more permissive for authenticated users
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

CREATE POLICY "Authenticated users can insert their own roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (true);


-- === 20251226031210_8eaaac98-c625-4170-b8d8-b0d94bc55153.sql ===
-- Update jobs SELECT policy to allow candidates to see all published jobs
DROP POLICY IF EXISTS "Users can view jobs from their organization" ON public.jobs;

-- Candidates can see all published jobs
-- Recruiters/managers can see all jobs from their organization (any status)
CREATE POLICY "Users can view published jobs and org jobs" 
ON public.jobs 
FOR SELECT 
TO authenticated
USING (
  -- Anyone can see published jobs
  (status = 'published')
  OR
  -- Recruiters/managers can see all jobs in their organization
  (organization_id = get_user_organization(auth.uid()))
);

-- === 20251226031749_9c2ac1c1-161d-4e3c-af7a-d0a3d8739fc1.sql ===
-- Update jobs SELECT policy to allow public (unauthenticated) access to published jobs
DROP POLICY IF EXISTS "Users can view published jobs and org jobs" ON public.jobs;

-- Allow anyone (including unauthenticated) to view published jobs
-- Authenticated users in the same org can see all jobs (any status)
CREATE POLICY "Public can view published jobs" 
ON public.jobs 
FOR SELECT 
USING (
  -- Anyone can see published jobs (no auth required)
  (status = 'published')
  OR
  -- Authenticated recruiters/managers can see all jobs in their organization
  (auth.uid() IS NOT NULL AND organization_id = get_user_organization(auth.uid()))
);

-- Also need to allow public access to organizations for job display
DROP POLICY IF EXISTS "Public can view organizations" ON public.organizations;

CREATE POLICY "Public can view organizations" 
ON public.organizations 
FOR SELECT 
USING (true);

-- === 20251226234057_639f5a1e-bfc0-4b00-bcc4-5233ba7d882f.sql ===
-- Allow recruiters to view profiles of candidates who applied to their organization's jobs
CREATE POLICY "Recruiters can view profiles of applicants"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IN (
    SELECT cp.user_id 
    FROM candidate_profiles cp
    JOIN applications a ON a.candidate_id = cp.id
    JOIN jobs j ON j.id = a.job_id
    WHERE j.organization_id = get_user_organization(auth.uid())
  )
);

-- === 20251227225514_c08248ab-2f05-4be1-8664-338926ea5283.sql ===
-- Create candidate shortlists table
CREATE TABLE public.candidate_shortlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shortlist candidates junction table
CREATE TABLE public.shortlist_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shortlist_id UUID NOT NULL REFERENCES public.candidate_shortlists(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  notes TEXT,
  status TEXT DEFAULT 'added',
  added_by UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(shortlist_id, candidate_id)
);

-- Create email sequences table
CREATE TABLE public.email_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create outreach campaigns table
CREATE TABLE public.outreach_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign recipients table
CREATE TABLE public.campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  current_step INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI agents table
CREATE TABLE public.ai_recruiting_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  search_criteria JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  auto_outreach BOOLEAN DEFAULT false,
  last_run_at TIMESTAMP WITH TIME ZONE,
  candidates_found INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agent recommendations table
CREATE TABLE public.agent_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_recruiting_agents(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  match_score INTEGER,
  recommendation_reason TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, candidate_id)
);

-- Create talent insights cache table
CREATE TABLE public.talent_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  search_query TEXT,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  insights_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.candidate_shortlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlist_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recruiting_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for candidate_shortlists
CREATE POLICY "Users can view org shortlists" ON public.candidate_shortlists
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org shortlists" ON public.candidate_shortlists
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org shortlists" ON public.candidate_shortlists
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org shortlists" ON public.candidate_shortlists
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for shortlist_candidates
CREATE POLICY "Users can view shortlist candidates" ON public.shortlist_candidates
  FOR SELECT USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can add shortlist candidates" ON public.shortlist_candidates
  FOR INSERT WITH CHECK (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update shortlist candidates" ON public.shortlist_candidates
  FOR UPDATE USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete shortlist candidates" ON public.shortlist_candidates
  FOR DELETE USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for email_sequences
CREATE POLICY "Users can view org sequences" ON public.email_sequences
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org sequences" ON public.email_sequences
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org sequences" ON public.email_sequences
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org sequences" ON public.email_sequences
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for outreach_campaigns
CREATE POLICY "Users can view org campaigns" ON public.outreach_campaigns
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org campaigns" ON public.outreach_campaigns
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org campaigns" ON public.outreach_campaigns
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org campaigns" ON public.outreach_campaigns
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for campaign_recipients
CREATE POLICY "Users can view campaign recipients" ON public.campaign_recipients
  FOR SELECT USING (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can add campaign recipients" ON public.campaign_recipients
  FOR INSERT WITH CHECK (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update campaign recipients" ON public.campaign_recipients
  FOR UPDATE USING (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for ai_recruiting_agents
CREATE POLICY "Users can view org agents" ON public.ai_recruiting_agents
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org agents" ON public.ai_recruiting_agents
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org agents" ON public.ai_recruiting_agents
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org agents" ON public.ai_recruiting_agents
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for agent_recommendations
CREATE POLICY "Users can view agent recommendations" ON public.agent_recommendations
  FOR SELECT USING (
    agent_id IN (
      SELECT id FROM public.ai_recruiting_agents WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update agent recommendations" ON public.agent_recommendations
  FOR UPDATE USING (
    agent_id IN (
      SELECT id FROM public.ai_recruiting_agents WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for talent_insights
CREATE POLICY "Users can view org insights" ON public.talent_insights
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org insights" ON public.talent_insights
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Add triggers for updated_at
CREATE TRIGGER update_candidate_shortlists_updated_at
  BEFORE UPDATE ON public.candidate_shortlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outreach_campaigns_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_recruiting_agents_updated_at
  BEFORE UPDATE ON public.ai_recruiting_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251228000802_3fccd073-9d23-45d0-9cf0-5c0b64ea3004.sql ===
-- Allow recruiters to view all profiles (for talent pool search)
CREATE POLICY "Recruiters can view all profiles for talent search" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'recruiter'::app_role));

-- Allow service role to insert agent recommendations (edge function uses service role)
-- Note: Service role bypasses RLS, but adding this for completeness
CREATE POLICY "Service can insert agent recommendations" 
ON public.agent_recommendations 
FOR INSERT 
WITH CHECK (true);

-- === 20251228001450_03a200c8-491a-4cc5-b78d-815104703a90.sql ===
-- Remove overly-permissive policy added previously (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service can insert agent recommendations" ON public.agent_recommendations;

-- === 20251228020326_dac6a51b-01ac-478e-b412-f84c0eee535b.sql ===
-- Make user_id nullable for imported/sourced profiles
ALTER TABLE public.candidate_profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add RLS policy for recruiters to insert sourced profiles (where user_id is null)
CREATE POLICY "Recruiters can insert sourced profiles"
ON public.candidate_profiles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IS NULL 
  AND organization_id = get_user_organization(auth.uid())
);

-- Add RLS policy for recruiters to view sourced profiles in their org
CREATE POLICY "Recruiters can view sourced profiles in org"
ON public.candidate_profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND user_id IS NULL 
  AND organization_id = get_user_organization(auth.uid())
);

-- === 20251228020410_fe04c100-1d19-46d3-ab79-5bc776177081.sql ===
-- Add full_name and contact columns to candidate_profiles for sourced profiles
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS ats_score integer;

-- === 20251228191328_8ccae1b5-6197-4372-9570-2be2f725c8c2.sql ===
-- Make the resumes bucket public so recruiters can view uploaded resumes
UPDATE storage.buckets SET public = true WHERE id = 'resumes';

-- === 20251228202349_adea3ac5-5631-4bd8-b6fd-3f540e3edab2.sql ===
-- Allow recruiters to upload resumes to the sourced folder
CREATE POLICY "Recruiters can upload sourced resumes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' 
  AND has_role(auth.uid(), 'recruiter'::app_role)
  AND (storage.foldername(name))[1] = 'sourced'
);

-- === 20251228203205_132cb753-d33e-4b72-9c76-1a6107f2ba5c.sql ===
-- Allow recruiters to view/download sourced resumes
CREATE POLICY "Recruiters can view sourced resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'resumes' 
  AND has_role(auth.uid(), 'recruiter'::app_role)
);

-- === 20251229001701_d75ffcf8-8a5e-42da-b26a-696dcc9b3c80.sql ===
-- Add recruiter notes and status to candidate profiles
ALTER TABLE public.candidate_profiles 
ADD COLUMN IF NOT EXISTS recruiter_notes text,
ADD COLUMN IF NOT EXISTS recruiter_status text DEFAULT 'new';

-- Allow recruiters to update these fields on candidate profiles
CREATE POLICY "Recruiters can update candidate notes and status" 
ON public.candidate_profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'recruiter'::app_role))
WITH CHECK (has_role(auth.uid(), 'recruiter'::app_role));

-- === 20251229024149_108195f9-058e-4fe8-9981-c03e96e1972d.sql ===
-- Add content_hash column to resumes table for duplicate detection
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS content_hash text;

-- Create index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_resumes_content_hash ON public.resumes(content_hash) WHERE content_hash IS NOT NULL;

-- === 20251229030447_4561df51-2191-4b61-9db5-b24e41da6c1d.sql ===
-- Prevent duplicate resumes by exact file hash (only enforces when content_hash is present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_content_hash
ON public.resumes(content_hash)
WHERE content_hash IS NOT NULL;

-- === 20251229032138_89e76e75-15b3-4b60-aef8-ed2196f1b97c.sql ===
-- ============================================
-- SECURITY FIX: Restrict data access to organization scope
-- ============================================

-- 1. Fix privilege escalation in user_roles
-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert their own roles" ON public.user_roles;

-- Create a restrictive policy: users can only insert candidate role for themselves
-- Recruiter/manager roles must be assigned through proper onboarding flow
CREATE POLICY "Users can only self-assign candidate role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'candidate'::app_role
);

-- 2. Create helper function to check if recruiter can access a candidate
CREATE OR REPLACE FUNCTION public.recruiter_can_access_candidate(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Candidate is in recruiter's org talent pool
    SELECT 1 FROM candidate_profiles cp
    WHERE cp.id = _candidate_id 
      AND cp.organization_id = get_user_organization(auth.uid())
  )
  OR EXISTS (
    -- Candidate applied to recruiter's org jobs
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = _candidate_id
      AND j.organization_id = get_user_organization(auth.uid())
  )
  OR EXISTS (
    -- Candidate is in recruiter's org shortlists
    SELECT 1 FROM shortlist_candidates sc
    JOIN candidate_shortlists cs ON cs.id = sc.shortlist_id
    WHERE sc.candidate_id = _candidate_id
      AND cs.organization_id = get_user_organization(auth.uid())
  )
$$;

-- 3. Fix profiles table - restrict recruiter access
DROP POLICY IF EXISTS "Recruiters can view all profiles for talent search" ON public.profiles;
DROP POLICY IF EXISTS "Recruiters can view profiles of applicants" ON public.profiles;

CREATE POLICY "Recruiters can view profiles of accessible candidates"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    has_role(auth.uid(), 'recruiter'::app_role) 
    AND user_id IN (
      SELECT cp.user_id FROM candidate_profiles cp
      WHERE recruiter_can_access_candidate(cp.id)
    )
  )
);

-- 4. Fix candidate_profiles table - restrict to org scope
DROP POLICY IF EXISTS "Recruiters can view candidate profiles" ON public.candidate_profiles;
DROP POLICY IF EXISTS "Recruiters can view sourced profiles in org" ON public.candidate_profiles;

CREATE POLICY "Recruiters can view accessible candidates"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    has_role(auth.uid(), 'recruiter'::app_role) 
    AND recruiter_can_access_candidate(id)
  )
);

-- 5. Fix resumes table - restrict to accessible candidates
DROP POLICY IF EXISTS "Recruiters can view resumes of applicants" ON public.resumes;

CREATE POLICY "Recruiters can view resumes of accessible candidates"
ON public.resumes
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 6. Fix candidate_skills table
DROP POLICY IF EXISTS "Recruiters can view skills of applicants" ON public.candidate_skills;

CREATE POLICY "Recruiters can view skills of accessible candidates"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 7. Fix candidate_experience table
DROP POLICY IF EXISTS "Recruiters can view experience of applicants" ON public.candidate_experience;

CREATE POLICY "Recruiters can view experience of accessible candidates"
ON public.candidate_experience
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- 8. Fix candidate_education table
DROP POLICY IF EXISTS "Recruiters can view education of applicants" ON public.candidate_education;

CREATE POLICY "Recruiters can view education of accessible candidates"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'recruiter'::app_role)
    AND recruiter_can_access_candidate(candidate_id)
  )
);

-- === 20251229032153_1c3e7271-2f8d-496a-8cec-8380aa576668.sql ===
-- Create a secure function to assign roles during signup
-- This bypasses RLS since it runs with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.assign_user_role(
  _user_id uuid,
  _role app_role,
  _organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (_user_id, _role, _organization_id)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Grant execute to authenticated users (the function itself validates context)
GRANT EXECUTE ON FUNCTION public.assign_user_role TO authenticated;

-- === 20251229205125_d9749f9e-07e1-4909-a7ac-1d6c26319c58.sql ===
-- Fix #1: Secure the assign_user_role function to prevent privilege escalation
-- Only allow users to assign the 'candidate' role to themselves

CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _organization_id uuid DEFAULT NULL)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Only allow users to assign roles to themselves
  IF _user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign roles to other users';
  END IF;
  
  -- Only allow candidate role for self-assignment
  -- Recruiter and account_manager roles must be assigned through admin workflows
  IF _role != 'candidate'::app_role THEN
    RAISE EXCEPTION 'Only candidate role can be self-assigned. Contact admin for other roles.';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (_user_id, _role, _organization_id)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Fix #2: Secure the recruiter update policy to only allow updates to accessible candidates
-- Drop the overly permissive policy and create a properly scoped one

DROP POLICY IF EXISTS "Recruiters can update candidate notes and status" ON public.candidate_profiles;

CREATE POLICY "Recruiters can update accessible candidate notes"
ON public.candidate_profiles
FOR UPDATE
USING (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND recruiter_can_access_candidate(id)
)
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role) 
  AND recruiter_can_access_candidate(id)
);

-- === 20251229214541_e545e94a-7a39-40f9-a202-15dc286805dd.sql ===
-- Fix 1: Make resumes bucket private and add proper storage policies
UPDATE storage.buckets SET public = false WHERE id = 'resumes';

-- Drop any existing policies on storage.objects for resumes bucket
DROP POLICY IF EXISTS "Allow public read for resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can view accessible candidate resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;

-- Policy: Users can upload their own resumes (folder structure: user_id/filename)
CREATE POLICY "Users can upload their own resumes" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view their own resumes
CREATE POLICY "Users can view their own resumes" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Recruiters can view resumes of candidates they have access to
CREATE POLICY "Recruiters can view accessible candidate resumes" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes' AND 
  has_role(auth.uid(), 'recruiter') AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT cp.user_id FROM candidate_profiles cp 
    WHERE recruiter_can_access_candidate(cp.id) AND cp.user_id IS NOT NULL
  )
);

-- Policy: Users can update their own resumes
CREATE POLICY "Users can update their own resumes" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own resumes
CREATE POLICY "Users can delete their own resumes" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- === 20251231153705_32fb535d-e2ab-4221-95ae-7710f7dcad60.sql ===
-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- === 20251231162408_531fa61a-4a5b-4372-becc-ef820211ae39.sql ===
-- Job alerts for candidates
CREATE TABLE public.job_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT[],
  locations TEXT[],
  job_types TEXT[],
  salary_min INTEGER,
  salary_max INTEGER,
  is_active BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily',
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own job alerts"
ON public.job_alerts FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Interview schedules
CREATE TABLE public.interview_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL,
  interviewer_id UUID NOT NULL,
  interview_type TEXT NOT NULL DEFAULT 'video',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  meeting_link TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters can manage interviews for their org"
ON public.interview_schedules FOR ALL
USING (
  interviewer_id = auth.uid() OR
  application_id IN (
    SELECT a.id FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE j.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Candidates can view their interviews"
ON public.interview_schedules FOR SELECT
USING (
  application_id IN (
    SELECT a.id FROM applications a
    JOIN candidate_profiles cp ON cp.id = a.candidate_id
    WHERE cp.user_id = auth.uid()
  )
);

-- Email templates
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_default BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage org email templates"
ON public.email_templates FOR ALL
USING (organization_id = get_user_organization(auth.uid()))
WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view org audit logs"
ON public.audit_logs FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid()) AND
  has_role(auth.uid(), 'account_manager')
);

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);

-- User preferences/settings
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  job_alert_frequency TEXT DEFAULT 'daily',
  application_updates BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
ON public.user_settings FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Application status history for timeline
CREATE TABLE public.application_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters can view and create status history"
ON public.application_status_history FOR ALL
USING (
  application_id IN (
    SELECT a.id FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE j.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Candidates can view their application history"
ON public.application_status_history FOR SELECT
USING (
  application_id IN (
    SELECT a.id FROM applications a
    JOIN candidate_profiles cp ON cp.id = a.candidate_id
    WHERE cp.user_id = auth.uid()
  )
);

-- Add onboarding_completed to candidate_profiles
ALTER TABLE public.candidate_profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Triggers for updated_at
CREATE TRIGGER update_job_alerts_updated_at BEFORE UPDATE ON public.job_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interview_schedules_updated_at BEFORE UPDATE ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251231180824_94ac7c5b-c275-494f-9d5e-a483786ef33f.sql ===
-- Create clients table for managing client companies
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Users can view org clients" 
ON public.clients 
FOR SELECT 
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can create org clients" 
ON public.clients 
FOR INSERT 
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager')));

CREATE POLICY "Users can update org clients" 
ON public.clients 
FOR UPDATE 
USING (organization_id = get_user_organization(auth.uid()) AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager')));

CREATE POLICY "Managers can delete org clients" 
ON public.clients 
FOR DELETE 
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'account_manager'));

-- Add client_id to jobs table
ALTER TABLE public.jobs ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Add rejection_reason to applications table for candidate feedback
ALTER TABLE public.applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE public.applications ADD COLUMN rejection_feedback TEXT;

-- Add trigger for updated_at on clients
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_clients_organization ON public.clients(organization_id);
CREATE INDEX idx_jobs_client ON public.jobs(client_id);
CREATE INDEX idx_audit_logs_org_time ON public.audit_logs(organization_id, created_at DESC);

-- === 20251231183024_7da1a0a5-68b9-4272-81a0-ad0fec0d8c6a.sql ===
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

-- === 20260101021710_96b8bb2a-222e-4c9b-aac3-5008dc5994ae.sql ===
-- Add super_admin to the app_role enum
-- This must be committed before being used in functions/policies
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- === 20260101021729_561a7d24-c7fa-46db-880a-b37968d0b729.sql ===
-- Create a function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Update user_roles policies to allow super admin to view all roles
DROP POLICY IF EXISTS "Super admins can view all user roles" ON public.user_roles;
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete any user role
DROP POLICY IF EXISTS "Super admins can delete user roles" ON public.user_roles;
CREATE POLICY "Super admins can delete user roles"
ON public.user_roles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can update any user role
DROP POLICY IF EXISTS "Super admins can update user roles" ON public.user_roles;
CREATE POLICY "Super admins can update user roles"
ON public.user_roles
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Super admins can view all profiles
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete profiles
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;
CREATE POLICY "Super admins can delete profiles"
ON public.profiles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can view all candidate profiles
DROP POLICY IF EXISTS "Super admins can view all candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can view all candidate profiles"
ON public.candidate_profiles
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can delete candidate profiles
DROP POLICY IF EXISTS "Super admins can delete candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can delete candidate profiles"
ON public.candidate_profiles
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Super admins can update candidate profiles (for suspension etc)
DROP POLICY IF EXISTS "Super admins can update candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Super admins can update candidate profiles"
ON public.candidate_profiles
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Create a table to track user suspensions
CREATE TABLE IF NOT EXISTS public.user_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  suspended_by uuid NOT NULL,
  reason text,
  suspended_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  lifted_at timestamp with time zone,
  lifted_by uuid
);

-- Enable RLS on suspensions table
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage suspensions
CREATE POLICY "Super admins can manage suspensions"
ON public.user_suspensions
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Users can view their own suspension status
CREATE POLICY "Users can view own suspension"
ON public.user_suspensions
FOR SELECT
USING (auth.uid() = user_id);

-- === 20260101031020_53fd9e10-7a41-487a-9aef-4fd525bbbae8.sql ===
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

-- === 20260101034117_3c87d1aa-4113-48a3-80b7-2c6696899be4.sql ===
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view organizations" ON public.organizations;

-- Only expose orgs that have at least one published job (for job listings)
CREATE POLICY "Public can view organizations with published jobs"
ON public.organizations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.organization_id = organizations.id 
    AND jobs.status = 'published'
  )
);

-- === 20260104135900_add_org_admin_role.sql ===
-- Add org_admin to the app_role enum (tenant-level org admin)
-- This MUST be in its own migration/transaction before any policies/functions reference it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'org_admin';





-- === 20260104140000_org_admin_invites_and_policies.sql ===
-- =========================
-- Org Admin Invites (platform super_admin creates org + invites org_admin)
-- =========================
CREATE TABLE IF NOT EXISTS public.org_admin_invites (
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

ALTER TABLE public.org_admin_invites ENABLE ROW LEVEL SECURITY;

-- Only platform super admins can manage org admin invites
CREATE POLICY "Platform super admins can manage org admin invites"
ON public.org_admin_invites
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Accept org admin invite: grants org_admin role for the current user
CREATE OR REPLACE FUNCTION public.accept_org_admin_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record org_admin_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM org_admin_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Optional safety: ensure invite email matches current auth user email
  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RAISE EXCEPTION 'Invite email does not match signed-in user';
  END IF;

  org_id := invite_record.organization_id;

  UPDATE org_admin_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'org_admin', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;

-- =========================
-- Manager Invites (org_admin invites account_manager)
-- =========================
CREATE TABLE IF NOT EXISTS public.manager_invites (
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

ALTER TABLE public.manager_invites ENABLE ROW LEVEL SECURITY;

-- Org admins can manage manager invites for their org
CREATE POLICY "Org admins can view manager invites"
ON public.manager_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can create manager invites"
ON public.manager_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can update manager invites"
ON public.manager_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can delete manager invites"
ON public.manager_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

-- Accept manager invite: grants account_manager role for the current user
CREATE OR REPLACE FUNCTION public.accept_manager_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record manager_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM manager_invites
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

  UPDATE manager_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'account_manager', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;

-- Org admins can view user_roles in their org (for user management)
CREATE POLICY "Org admins can view org user roles"
ON public.user_roles
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (auth.uid() = user_id OR has_role(auth.uid(), 'org_admin'))
);

-- Org admins can view relevant profiles in their org (for user management)
CREATE POLICY "Org admins can view org profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'org_admin')
  AND user_id IN (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.organization_id = get_user_organization(auth.uid())
  )
);

-- Remove manager from org (org_admin only)
CREATE OR REPLACE FUNCTION public.remove_manager_from_org(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can remove managers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role = 'account_manager'
      AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'User is not a manager in your organization';
  END IF;

  DELETE FROM user_roles
  WHERE user_id = _user_id
    AND role = 'account_manager'
    AND organization_id = get_user_organization(auth.uid());
END;
$$;




-- === 20260104150000_invite_email_mismatch_soft_fail.sql ===
-- Make invite acceptance return NULL instead of throwing if email mismatches.
-- This produces a cleaner UX in the app and avoids 500s.

CREATE OR REPLACE FUNCTION public.accept_org_admin_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record org_admin_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM org_admin_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RETURN NULL;
  END IF;

  org_id := invite_record.organization_id;

  UPDATE org_admin_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'org_admin', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_manager_invite(_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record manager_invites%ROWTYPE;
  org_id uuid;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO invite_record
  FROM manager_invites
  WHERE invite_token = _invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF caller_email IS NOT NULL AND lower(caller_email) <> lower(invite_record.email) THEN
    RETURN NULL;
  END IF;

  org_id := invite_record.organization_id;

  UPDATE manager_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_record.id;

  INSERT INTO user_roles (user_id, role, organization_id)
  VALUES (auth.uid(), 'account_manager', org_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN org_id;
END;
$$;





-- === 20260105120000_rbac_align_doc.sql ===
-- Align RBAC behavior with product RBAC doc:
-- - Platform admin (super_admin) can revoke org_admin
-- - org_admin can manage recruiters and recruiter invites for their org
-- - org_admin can manage candidates linked to their org (notes/status/link/unlink) via RPCs

-- =========================
-- Recruiter invites: allow org_admin to manage invites for their org
-- =========================
ALTER TABLE public.recruiter_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view org recruiter invites"
ON public.recruiter_invites
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can create org recruiter invites"
ON public.recruiter_invites
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can update org recruiter invites"
ON public.recruiter_invites
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

CREATE POLICY "Org admins can delete org recruiter invites"
ON public.recruiter_invites
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);

-- =========================
-- Remove recruiter: allow org_admin OR account_manager
-- =========================
CREATE OR REPLACE FUNCTION public.remove_recruiter_from_org(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is an org admin OR manager in the same org
  IF NOT (has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'account_manager')) THEN
    RAISE EXCEPTION 'Only org admins or account managers can remove recruiters';
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

-- =========================
-- Candidate management (org-linked candidates)
-- org_admin can VIEW org-linked candidates; mutations occur via RPCs for safety.
-- =========================
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view org candidates"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin')
  AND organization_id = get_user_organization(auth.uid())
);

-- Update candidate org-linking by email (public candidates supported)
CREATE OR REPLACE FUNCTION public.org_admin_link_candidate_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  org_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can link candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure candidate_profile exists
  INSERT INTO public.candidate_profiles (user_id, organization_id)
  VALUES (target_user_id, org_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- If candidate already belongs to a different org, block.
  IF EXISTS (
    SELECT 1 FROM public.candidate_profiles
    WHERE user_id = target_user_id
      AND organization_id IS NOT NULL
      AND organization_id <> org_id
  ) THEN
    RAISE EXCEPTION 'Candidate is already linked to another organization';
  END IF;

  UPDATE public.candidate_profiles
  SET organization_id = org_id
  WHERE user_id = target_user_id;

  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_admin_unlink_candidate(_candidate_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can unlink candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  UPDATE public.candidate_profiles
  SET organization_id = NULL
  WHERE user_id = _candidate_user_id
    AND organization_id = org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_admin_update_candidate_admin_fields(
  _candidate_user_id uuid,
  _recruiter_status text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can update candidate admin fields';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  -- Only update candidates currently linked to this org.
  UPDATE public.candidate_profiles
  SET
    recruiter_status = COALESCE(_recruiter_status, recruiter_status),
    recruiter_notes = COALESCE(_recruiter_notes, recruiter_notes)
  WHERE user_id = _candidate_user_id
    AND organization_id = org_id;
END;
$$;

-- =========================
-- Platform admin: revoke org admins
-- =========================
CREATE OR REPLACE FUNCTION public.revoke_org_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can revoke org admins';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin';
END;
$$;





-- === 20260107194500_super_admin_global_readonly.sql ===
-- Platform Admin (super_admin) global read-only
-- Allows internal troubleshooting + audit log review across all organizations.
-- Write operations remain blocked by default RLS policies (except explicit RPCs like revoke_org_admin).

-- =========================
-- Core identity/tenant tables
-- =========================
CREATE POLICY "Super admins can read all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all organizations"
ON public.organizations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Hiring workflow tables
-- =========================
CREATE POLICY "Super admins can read all jobs"
ON public.jobs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all applications"
ON public.applications
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all application status history"
ON public.application_status_history
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all interview schedules"
ON public.interview_schedules
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Candidates + resumes
-- =========================
CREATE POLICY "Super admins can read all candidate profiles"
ON public.candidate_profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate skills"
ON public.candidate_skills
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate experience"
ON public.candidate_experience
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate education"
ON public.candidate_education
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all resumes"
ON public.resumes
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all ai resume analyses"
ON public.ai_resume_analyses
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Talent ops / recruiter tooling tables
-- =========================
CREATE POLICY "Super admins can read all clients"
ON public.clients
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate shortlists"
ON public.candidate_shortlists
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all shortlist candidates"
ON public.shortlist_candidates
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all outreach campaigns"
ON public.outreach_campaigns
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all campaign recipients"
ON public.campaign_recipients
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all email sequences"
ON public.email_sequences
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all email templates"
ON public.email_templates
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all ai recruiting agents"
ON public.ai_recruiting_agents
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all agent recommendations"
ON public.agent_recommendations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all talent insights"
ON public.talent_insights
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- User-facing supporting tables
-- =========================
CREATE POLICY "Super admins can read all notifications"
ON public.notifications
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all job alerts"
ON public.job_alerts
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user settings"
ON public.user_settings
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Invite/admin tables
-- =========================
CREATE POLICY "Super admins can read all org admin invites"
ON public.org_admin_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all manager invites"
ON public.manager_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all recruiter invites"
ON public.recruiter_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all organization invite codes"
ON public.organization_invite_codes
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Audit / ops tables
-- =========================
CREATE POLICY "Super admins can read all audit logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- Make audit logs tamper-resistant from the client surface area.
-- Service role bypasses RLS, so edge functions and trusted services can still insert.
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert audit logs for themselves in their org"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND organization_id = get_user_organization(auth.uid())
);

-- Archived users and suspensions are platform-level operational data; allow read-only for super_admin.
CREATE POLICY "Super admins can read all archived users"
ON public.archived_users
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user suspensions"
ON public.user_suspensions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));




-- === 20260107201000_bootstrap_super_admin_allowlist.sql ===
-- Bootstrap Platform Admin (super_admin) role for allowlisted emails
-- This avoids manual SQL after `supabase db reset` when recreating internal admins in Studio.
--
-- IMPORTANT:
-- - This is intended for internal operator accounts only.
-- - Normal users must never be able to self-assign privileged roles.

-- 1) Prevent privilege escalation: users must NOT be able to insert roles directly.
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

-- 2) Allowlist table for internal platform admins
CREATE TABLE IF NOT EXISTS public.platform_admin_allowlist (
  email text PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_allowlist ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read the allowlist (optional; keeps it internal).
DROP POLICY IF EXISTS "Super admins can read platform admin allowlist" ON public.platform_admin_allowlist;
CREATE POLICY "Super admins can read platform admin allowlist"
ON public.platform_admin_allowlist
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- NOTE:
-- Do NOT hardcode a single production email here.
-- In each environment, add platform admin emails via Supabase Studio (Table Editor)
-- by inserting rows into `public.platform_admin_allowlist`.

-- 3) Extend the new-user trigger to auto-assign super_admin for allowlisted emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- If this email is allowlisted, grant platform admin role automatically.
  IF EXISTS (
    SELECT 1
    FROM public.platform_admin_allowlist a
    WHERE lower(a.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, 'super_admin', NULL)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;




-- === 20260107213000_audit_logs_systemwide.sql ===
-- System-wide audit logging for write activity (INSERT/UPDATE/DELETE)
-- Goals:
-- - Capture actor (auth.uid()) and org scope when available
-- - Support platform-level events (org_id may be NULL)
-- - Support candidate/self events (org_id may be NULL)
-- - Prevent client-side forgery of audit logs

-- 1) Make organization_id nullable to support platform + public candidate actions
ALTER TABLE public.audit_logs
  ALTER COLUMN organization_id DROP NOT NULL;

-- 2) Replace insert policy with a safer one:
-- - user_id must be the actor
-- - org_id may be NULL OR must match actor's org
-- - super_admin may log against any org (still user_id must be actor)
DROP POLICY IF EXISTS "Users can insert audit logs for themselves in their org" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "Actors can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin')
  )
);

-- 3) Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_log_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  org_id uuid;
  entity uuid;
  details jsonb;
  action text;
BEGIN
  -- Avoid recursion if someone ever adds triggers to audit_logs
  IF TG_TABLE_NAME = 'audit_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  actor := auth.uid();

  -- If no actor (e.g. service role / internal), don't log via trigger.
  -- Edge functions using service role should insert audit logs explicitly.
  IF actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Infer org_id (prefer row org, else actor org, else NULL)
  org_id := NULL;
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      org_id := (to_jsonb(NEW)->>'organization_id')::uuid;
    ELSE
      org_id := (to_jsonb(OLD)->>'organization_id')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    org_id := NULL;
  END;
  IF org_id IS NULL THEN
    org_id := get_user_organization(actor);
  END IF;

  -- Entity id if present (best effort)
  entity := NULL;
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      entity := (to_jsonb(NEW)->>'id')::uuid;
    ELSE
      entity := (to_jsonb(OLD)->>'id')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    entity := NULL;
  END;

  action := lower(TG_OP);

  IF TG_OP = 'UPDATE' THEN
    details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'INSERT' THEN
    details := jsonb_build_object('new', to_jsonb(NEW));
  ELSE
    details := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    ip_address
  ) VALUES (
    org_id,
    actor,
    action,
    TG_TABLE_NAME,
    entity,
    details,
    NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Attach triggers to core tables (write activity)
-- Note: Keep scope to tables that represent user/system actions.
DROP TRIGGER IF EXISTS audit_profiles_write ON public.profiles;
CREATE TRIGGER audit_profiles_write
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_user_roles_write ON public.user_roles;
CREATE TRIGGER audit_user_roles_write
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_organizations_write ON public.organizations;
CREATE TRIGGER audit_organizations_write
AFTER INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_jobs_write ON public.jobs;
CREATE TRIGGER audit_jobs_write
AFTER INSERT OR UPDATE OR DELETE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_applications_write ON public.applications;
CREATE TRIGGER audit_applications_write
AFTER INSERT OR UPDATE OR DELETE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_profiles_write ON public.candidate_profiles;
CREATE TRIGGER audit_candidate_profiles_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_recruiter_invites_write ON public.recruiter_invites;
CREATE TRIGGER audit_recruiter_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.recruiter_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_manager_invites_write ON public.manager_invites;
CREATE TRIGGER audit_manager_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.manager_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_org_admin_invites_write ON public.org_admin_invites;
CREATE TRIGGER audit_org_admin_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.org_admin_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

-- Additional tables (broader coverage of system activity)
DROP TRIGGER IF EXISTS audit_clients_write ON public.clients;
CREATE TRIGGER audit_clients_write
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_skills_write ON public.candidate_skills;
CREATE TRIGGER audit_candidate_skills_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_skills
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_experience_write ON public.candidate_experience;
CREATE TRIGGER audit_candidate_experience_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_experience
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_education_write ON public.candidate_education;
CREATE TRIGGER audit_candidate_education_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_education
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_resumes_write ON public.resumes;
CREATE TRIGGER audit_resumes_write
AFTER INSERT OR UPDATE OR DELETE ON public.resumes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_shortlists_write ON public.candidate_shortlists;
CREATE TRIGGER audit_candidate_shortlists_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_shortlists
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_shortlist_candidates_write ON public.shortlist_candidates;
CREATE TRIGGER audit_shortlist_candidates_write
AFTER INSERT OR UPDATE OR DELETE ON public.shortlist_candidates
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_outreach_campaigns_write ON public.outreach_campaigns;
CREATE TRIGGER audit_outreach_campaigns_write
AFTER INSERT OR UPDATE OR DELETE ON public.outreach_campaigns
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_campaign_recipients_write ON public.campaign_recipients;
CREATE TRIGGER audit_campaign_recipients_write
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_email_sequences_write ON public.email_sequences;
CREATE TRIGGER audit_email_sequences_write
AFTER INSERT OR UPDATE OR DELETE ON public.email_sequences
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_email_templates_write ON public.email_templates;
CREATE TRIGGER audit_email_templates_write
AFTER INSERT OR UPDATE OR DELETE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_ai_recruiting_agents_write ON public.ai_recruiting_agents;
CREATE TRIGGER audit_ai_recruiting_agents_write
AFTER INSERT OR UPDATE OR DELETE ON public.ai_recruiting_agents
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_agent_recommendations_write ON public.agent_recommendations;
CREATE TRIGGER audit_agent_recommendations_write
AFTER INSERT OR UPDATE OR DELETE ON public.agent_recommendations
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_talent_insights_write ON public.talent_insights;
CREATE TRIGGER audit_talent_insights_write
AFTER INSERT OR UPDATE OR DELETE ON public.talent_insights
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_ai_resume_analyses_write ON public.ai_resume_analyses;
CREATE TRIGGER audit_ai_resume_analyses_write
AFTER INSERT OR UPDATE OR DELETE ON public.ai_resume_analyses
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_notifications_write ON public.notifications;
CREATE TRIGGER audit_notifications_write
AFTER INSERT OR UPDATE OR DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_job_alerts_write ON public.job_alerts;
CREATE TRIGGER audit_job_alerts_write
AFTER INSERT OR UPDATE OR DELETE ON public.job_alerts
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_user_settings_write ON public.user_settings;
CREATE TRIGGER audit_user_settings_write
AFTER INSERT OR UPDATE OR DELETE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_application_status_history_write ON public.application_status_history;
CREATE TRIGGER audit_application_status_history_write
AFTER INSERT OR UPDATE OR DELETE ON public.application_status_history
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_interview_schedules_write ON public.interview_schedules;
CREATE TRIGGER audit_interview_schedules_write
AFTER INSERT OR UPDATE OR DELETE ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();




-- === 20260107213500_audit_rpcs.sql ===
-- Audit logging for privileged RPCs (explicit intent logs)
-- We prefer explicit events for key admin actions in addition to generic triggers.

-- Platform admin: revoke org admins
CREATE OR REPLACE FUNCTION public.revoke_org_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can revoke org admins';
  END IF;

  SELECT organization_id INTO org_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin'
  LIMIT 1;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'org_admin';

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    org_id,
    auth.uid(),
    'revoke_org_admin',
    'user_roles',
    _user_id,
    jsonb_build_object('revoked_user_id', _user_id),
    NULL
  );
END;
$$;




-- === 20260107230000_audit_logs_enriched_view.sql ===
-- Audit log performance + search support for Platform Admin

-- Fast global ordering (platform admin use-case)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
ON public.audit_logs (created_at DESC);

-- Enriched view for search/display (joins org + user identity)
CREATE OR REPLACE VIEW public.audit_logs_enriched AS
SELECT
  al.id,
  al.organization_id,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.details,
  al.details::text AS details_text,
  al.ip_address,
  al.created_at,
  o.name AS org_name,
  p.full_name AS user_full_name,
  p.email AS user_email
FROM public.audit_logs al
LEFT JOIN public.organizations o ON o.id = al.organization_id
LEFT JOIN public.profiles p ON p.user_id = al.user_id;




-- === 20260107234000_org_admin_audit_logs_policy.sql ===
-- Allow tenant org admins to view audit logs for their own organization
DROP POLICY IF EXISTS "Org admins can view org audit logs" ON public.audit_logs;

CREATE POLICY "Org admins can view org audit logs"
ON public.audit_logs
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'org_admin')
);




-- === 20260108090000_audit_logs_enriched_actor_flags.sql ===
-- Add actor role flags to audit_logs_enriched for better filtering in UIs
-- (e.g. org admins should not see platform-admin actions by default)

CREATE OR REPLACE VIEW public.audit_logs_enriched AS
SELECT
  al.id,
  al.organization_id,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.details,
  al.details::text AS details_text,
  al.ip_address,
  al.created_at,
  o.name AS org_name,
  p.full_name AS user_full_name,
  p.email AS user_email,
  COALESCE(
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = al.user_id
        AND ur.role = 'super_admin'
    ),
    false
  ) AS actor_is_super_admin
FROM public.audit_logs al
LEFT JOIN public.organizations o ON o.id = al.organization_id
LEFT JOIN public.profiles p ON p.user_id = al.user_id;




-- === 20260108120000_jobs_work_mode_and_experience_levels.sql ===
-- Add work_mode (onsite/hybrid/remote/unknown) and expand experience_level options.
-- We keep existing `job_type` (employment type) intact.

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS work_mode TEXT DEFAULT 'unknown';

-- Add/replace check constraint for work_mode
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_work_mode_check'
  ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_work_mode_check;
  END IF;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_work_mode_check
CHECK (work_mode IN ('onsite', 'hybrid', 'remote', 'unknown'));

-- Expand experience_level check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_experience_level_check'
  ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_experience_level_check;
  END IF;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_experience_level_check
CHECK (experience_level IN (
  'entry',
  'mid',
  'senior',
  'lead',
  'principal_architect',
  'manager',
  'director',
  'executive',
  'unknown'
));



-- === 20260109000000_marketplace_jobs_visibility_and_candidate_links.sql ===
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



-- === 20260109001000_org_admin_candidate_linking_via_links.sql ===
-- Update org admin candidate linking to use candidate_org_links (many-to-many)

-- Replace org-admin view policy for candidates
DROP POLICY IF EXISTS "Org admins can view org candidates" ON public.candidate_profiles;
CREATE POLICY "Org admins can view org candidates via links"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin')
  AND EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = public.candidate_profiles.id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);

-- Link candidate by email (creates link instead of overwriting a single org_id)
CREATE OR REPLACE FUNCTION public.org_admin_link_candidate_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can link candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure candidate_profile exists
  INSERT INTO public.candidate_profiles (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = target_user_id;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, org_id, 'org_admin_link', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'org_admin_link', created_by = auth.uid();

  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_admin_unlink_candidate(_candidate_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can unlink candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.candidate_org_links
  SET status = 'inactive'
  WHERE candidate_id = cp_id
    AND organization_id = org_id;
END;
$$;

-- Candidate admin fields: only allowed if candidate is linked to org
CREATE OR REPLACE FUNCTION public.org_admin_update_candidate_admin_fields(
  _candidate_user_id uuid,
  _recruiter_status text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can update candidate admin fields';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.candidate_is_linked_to_org(cp_id, org_id) THEN
    RAISE EXCEPTION 'Candidate is not linked to your organization';
  END IF;

  UPDATE public.candidate_profiles
  SET
    recruiter_status = COALESCE(_recruiter_status, recruiter_status),
    recruiter_notes = COALESCE(_recruiter_notes, recruiter_notes)
  WHERE id = cp_id;
END;
$$;



-- === 20260109002000_candidate_engagement_workflow.sql ===
-- Recruiter engagement workflow (tenant-scoped): rate confirmation → RTR → screening → submission → onboarding

CREATE TABLE IF NOT EXISTS public.candidate_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'rate_confirmation',
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (organization_id, candidate_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_engagements_stage_check') THEN
    ALTER TABLE public.candidate_engagements DROP CONSTRAINT candidate_engagements_stage_check;
  END IF;
END $$;

ALTER TABLE public.candidate_engagements
ADD CONSTRAINT candidate_engagements_stage_check
CHECK (stage IN (
  'rate_confirmation',
  'right_to_represent',
  'screening',
  'submission',
  'interview',
  'offer',
  'onboarding',
  'closed'
));

-- Simple updated_at trigger
DROP TRIGGER IF EXISTS trg_candidate_engagements_updated_at ON public.candidate_engagements;
CREATE TRIGGER trg_candidate_engagements_updated_at
BEFORE UPDATE ON public.candidate_engagements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.candidate_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters can manage candidate engagements" ON public.candidate_engagements;
CREATE POLICY "Recruiters can manage candidate engagements"
ON public.candidate_engagements
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND organization_id = get_user_organization(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'recruiter'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);



-- === 20260109003000_candidate_org_links_rls_and_invite_codes.sql ===
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



-- === 20260109011000_super_admin_candidate_link_and_suspend.sql ===
-- Super Admin candidate management (support tooling)
-- - Link/unlink candidate to org (candidate_org_links)
-- - Toggle candidate marketplace opt-in
-- - Suspend/unsuspend user (soft disable via profile flag; app enforces)
-- All actions are audit logged.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Ensure audit coverage for new tables
DROP TRIGGER IF EXISTS audit_candidate_org_links_write ON public.candidate_org_links;
CREATE TRIGGER audit_candidate_org_links_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_org_links
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_engagements_write ON public.candidate_engagements;
CREATE TRIGGER audit_candidate_engagements_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_engagements
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

CREATE OR REPLACE FUNCTION public.super_admin_set_user_suspended(
  _user_id uuid,
  _is_suspended boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can suspend users';
  END IF;

  UPDATE public.profiles
  SET is_suspended = _is_suspended
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    CASE WHEN _is_suspended THEN 'suspend_user' ELSE 'unsuspend_user' END,
    'profiles',
    _user_id,
    jsonb_build_object('target_user_id', _user_id, 'is_suspended', _is_suspended, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_candidate_marketplace_opt_in(
  _candidate_user_id uuid,
  _opt_in boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update candidate marketplace settings';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  UPDATE public.candidate_profiles
  SET marketplace_opt_in = _opt_in,
      marketplace_visibility_level = CASE WHEN _opt_in THEN 'limited' ELSE 'anonymous' END
  WHERE id = cp_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    'set_candidate_marketplace_opt_in',
    'candidate_profiles',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'marketplace_opt_in', _opt_in, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_link_candidate_to_org(
  _candidate_user_id uuid,
  _organization_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can link candidates to organizations';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, _organization_id, 'super_admin', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'super_admin', created_by = auth.uid();

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    _organization_id,
    auth.uid(),
    'super_admin_link_candidate_to_org',
    'candidate_org_links',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'organization_id', _organization_id, 'reason', _reason),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_unlink_candidate_from_org(
  _candidate_user_id uuid,
  _organization_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can unlink candidates from organizations';
  END IF;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;
  IF cp_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.candidate_org_links
  SET status = 'inactive'
  WHERE candidate_id = cp_id
    AND organization_id = _organization_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    _organization_id,
    auth.uid(),
    'super_admin_unlink_candidate_from_org',
    'candidate_org_links',
    cp_id,
    jsonb_build_object('candidate_user_id', _candidate_user_id, 'organization_id', _organization_id, 'reason', _reason),
    NULL
  );
END;
$$;



-- === 20260109012000_fix_candidate_marketplace_opt_in_rpc.sql ===
-- Fix: super_admin_set_candidate_marketplace_opt_in should:
-- - set marketplace_visibility_level to full when opt-in is enabled (non-anonymous)
-- - backfill candidate_profiles.full_name/email from profiles when available

CREATE OR REPLACE FUNCTION public.super_admin_set_candidate_marketplace_opt_in(
  _candidate_user_id uuid,
  _opt_in boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
  p_full_name text;
  p_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update candidate marketplace settings';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  SELECT full_name, email INTO p_full_name, p_email
  FROM public.profiles
  WHERE user_id = _candidate_user_id
  LIMIT 1;

  UPDATE public.candidate_profiles
  SET marketplace_opt_in = _opt_in,
      marketplace_visibility_level = CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      full_name = COALESCE(public.candidate_profiles.full_name, p_full_name),
      email = COALESCE(public.candidate_profiles.email, p_email)
  WHERE id = cp_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    'set_candidate_marketplace_opt_in',
    'candidate_profiles',
    cp_id,
    jsonb_build_object(
      'candidate_user_id', _candidate_user_id,
      'marketplace_opt_in', _opt_in,
      'marketplace_visibility_level', CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      'reason', _reason
    ),
    NULL
  );
END;
$$;



-- === 20260109013000_marketplace_opt_in_full_visibility.sql ===
-- Marketplace opt-in should be full visibility (non-anonymous).
-- This migration updates the RPC and backfills existing discoverable candidates to full visibility.

-- Update RPC (idempotent)
CREATE OR REPLACE FUNCTION public.super_admin_set_candidate_marketplace_opt_in(
  _candidate_user_id uuid,
  _opt_in boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cp_id uuid;
  p_full_name text;
  p_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update candidate marketplace settings';
  END IF;

  INSERT INTO public.candidate_profiles (user_id)
  VALUES (_candidate_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = _candidate_user_id LIMIT 1;

  SELECT full_name, email INTO p_full_name, p_email
  FROM public.profiles
  WHERE user_id = _candidate_user_id
  LIMIT 1;

  UPDATE public.candidate_profiles
  SET marketplace_opt_in = _opt_in,
      marketplace_visibility_level = CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      full_name = COALESCE(public.candidate_profiles.full_name, p_full_name),
      email = COALESCE(public.candidate_profiles.email, p_email)
  WHERE id = cp_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (
    NULL,
    auth.uid(),
    'set_candidate_marketplace_opt_in',
    'candidate_profiles',
    cp_id,
    jsonb_build_object(
      'candidate_user_id', _candidate_user_id,
      'marketplace_opt_in', _opt_in,
      'marketplace_visibility_level', CASE WHEN _opt_in THEN 'full' ELSE 'anonymous' END,
      'reason', _reason
    ),
    NULL
  );
END;
$$;

-- Backfill: all opt-in candidates become full visibility
UPDATE public.candidate_profiles
SET marketplace_visibility_level = 'full'
WHERE marketplace_opt_in = true;



-- === 20260109014000_marketplace_resume_access.sql ===
-- Allow recruiters to view resumes for marketplace-discoverable candidates (read-only).

-- Update public.resumes SELECT policy to include marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view resumes of accessible candidates" ON public.resumes;

CREATE POLICY "Recruiters can view resumes of accessible candidates"
ON public.resumes
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



-- === 20260109220000_fix_candidate_job_visibility_leak.sql ===
-- Fix: candidates seeing tenant-private jobs.
-- Root cause:
-- - get_user_organization(user_id) returned organization_id from ANY role row (LIMIT 1),
--   which could erroneously give candidates an org context.
-- - jobs SELECT policy granted org-wide job visibility to any authenticated user if
--   organization_id = get_user_organization(auth.uid()).
--
-- Correct behavior:
-- - Only staff roles (recruiter/account_manager/org_admin/super_admin) should ever receive
--   org-wide job visibility from get_user_organization().
-- - Candidates should see:
--   - public published jobs
--   - private published jobs ONLY when linked via candidate_org_links.

-- 1) Make get_user_organization() ignore candidate role rows.
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.organization_id
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.organization_id IS NOT NULL
    AND ur.role <> 'candidate'::app_role
  LIMIT 1
$$;

-- 2) Tighten jobs SELECT policy: org-wide access only for staff roles.
DO $$
BEGIN
  -- Policy was introduced in 20260109000000_marketplace_jobs_visibility_and_candidate_links.sql
  DROP POLICY IF EXISTS "Jobs visibility rules" ON public.jobs;
END $$;

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
    AND (
      has_role(auth.uid(), 'recruiter'::app_role)
      OR has_role(auth.uid(), 'account_manager'::app_role)
      OR has_role(auth.uid(), 'org_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
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



-- === 20260109223000_drop_legacy_jobs_select_policies.sql ===
-- Ensure only one SELECT policy governs job visibility.
-- Postgres ORs SELECT policies; if any legacy permissive policy remains,
-- candidates may see tenant-private jobs.

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Legacy policies from earlier iterations
  DROP POLICY IF EXISTS "Published jobs are viewable by all authenticated users" ON public.jobs;
  DROP POLICY IF EXISTS "Users can view jobs from their organization" ON public.jobs;
  DROP POLICY IF EXISTS "Users can view published jobs and org jobs" ON public.jobs;
  DROP POLICY IF EXISTS "Public can view published jobs" ON public.jobs;

  -- Current policy names from marketplace iteration
  DROP POLICY IF EXISTS "Jobs visibility rules" ON public.jobs;
END $$;

-- Recreate the single source of truth policy
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
    AND (
      has_role(auth.uid(), 'recruiter'::app_role)
      OR has_role(auth.uid(), 'account_manager'::app_role)
      OR has_role(auth.uid(), 'org_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
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



-- === 20260109224500_candidate_org_links_job_visibility_filter.sql ===
-- Candidates should only gain access to tenant-private jobs when there is an explicit
-- candidate-facing relationship (invite/apply/admin link). Internal workflow links like
-- link_type = 'engagement' must NOT grant candidates access to all private jobs.
--
-- This function is used by the jobs SELECT policy for candidates.

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
    AND col.status = 'active'
    AND col.link_type IN (
      'invite_code',
      'application',
      'org_admin_link',
      'super_admin',
      'legacy_org_id'
    );
$$;



-- === 20260110012000_candidate_skills_skill_type.sql ===
-- Add skill typing so we can distinguish technical vs soft skills.

ALTER TABLE public.candidate_skills
ADD COLUMN IF NOT EXISTS skill_type text NOT NULL DEFAULT 'technical';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_skills_skill_type_check') THEN
    ALTER TABLE public.candidate_skills DROP CONSTRAINT candidate_skills_skill_type_check;
  END IF;
END $$;

ALTER TABLE public.candidate_skills
ADD CONSTRAINT candidate_skills_skill_type_check
CHECK (skill_type IN ('technical', 'soft'));

CREATE INDEX IF NOT EXISTS idx_candidate_skills_candidate_type
ON public.candidate_skills(candidate_id, skill_type);



-- === 20260110013000_remove_salary_fields.sql ===
-- Remove salary fields from the system (contracting-first product).
-- This drops:
-- - candidate_profiles.desired_salary_min / desired_salary_max
-- - jobs.salary_min / salary_max
-- - job_alerts.salary_min / salary_max

ALTER TABLE public.candidate_profiles
  DROP COLUMN IF EXISTS desired_salary_min,
  DROP COLUMN IF EXISTS desired_salary_max;

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS salary_min,
  DROP COLUMN IF EXISTS salary_max;

ALTER TABLE public.job_alerts
  DROP COLUMN IF EXISTS salary_min,
  DROP COLUMN IF EXISTS salary_max;



-- === 20260110014000_candidate_profiles_github_url.sql ===
-- Add GitHub profile URL to candidate_profiles for contact info.

ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS github_url text;



-- === 20260110020000_resume_workspace_tables.sql ===
-- Resume Workspace (Phase 1)
-- New in-app resume documents + versions (separate from uploaded resume files).

-- -----------------------------
-- Tables
-- -----------------------------

CREATE TABLE IF NOT EXISTS public.resume_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Resume',
  template_id text NOT NULL DEFAULT 'ats_single',
  target_role text NULL,
  target_seniority text NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_documents_candidate ON public.resume_documents(candidate_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.resume_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_document_id uuid NOT NULL REFERENCES public.resume_documents(id) ON DELETE CASCADE,
  content_json jsonb NOT NULL,
  change_summary text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_document_versions_doc ON public.resume_document_versions(resume_document_id, created_at DESC);

-- -----------------------------
-- RLS
-- -----------------------------

ALTER TABLE public.resume_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Candidates can manage their resume documents" ON public.resume_documents;
CREATE POLICY "Candidates can manage their resume documents"
ON public.resume_documents
FOR ALL
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Candidates can manage their resume document versions" ON public.resume_document_versions;
CREATE POLICY "Candidates can manage their resume document versions"
ON public.resume_document_versions
FOR ALL
TO authenticated
USING (
  resume_document_id IN (
    SELECT rd.id
    FROM public.resume_documents rd
    WHERE rd.candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  resume_document_id IN (
    SELECT rd.id
    FROM public.resume_documents rd
    WHERE rd.candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  )
);

-- -----------------------------
-- updated_at trigger
-- -----------------------------

DROP TRIGGER IF EXISTS update_resume_documents_updated_at ON public.resume_documents;
CREATE TRIGGER update_resume_documents_updated_at
BEFORE UPDATE ON public.resume_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();



-- === 20260110021000_resume_workspace_context.sql ===
-- Resume Workspace: store tailoring context on resume_documents

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS base_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS jd_text text;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS additional_instructions text;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS linkedin_url text;



-- === 20260110022000_resume_documents_analysis_json.sql ===
-- Resume Workspace: store JD extraction + ATS/risk report alongside the resume document

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb;



-- === 20260117090000_backfill_candidate_org_links_for_sourced_candidates.sql ===
-- Backfill candidate_org_links for sourced/imported candidates.
-- Why: Recruiter visibility is driven by candidate_org_links (RLS), but older imports only set
-- candidate_profiles.organization_id for user_id IS NULL rows.
--
-- This backfills links for:
-- - sourced candidates (user_id IS NULL)
-- - that have an organization_id set
-- - and do NOT already have a candidate_org_links row for that org
--
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_at, created_by)
SELECT
  cp.id AS candidate_id,
  cp.organization_id,
  'bulk_import_backfill' AS link_type,
  'active' AS status,
  now() AS created_at,
  NULL::uuid AS created_by
FROM public.candidate_profiles cp
WHERE cp.user_id IS NULL
  AND cp.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = cp.id
      AND col.organization_id = cp.organization_id
  )
ON CONFLICT (candidate_id, organization_id) DO NOTHING;



-- === 20260118040000_candidate_profiles_website.sql ===
-- Add website/source link to candidate_profiles for web-sourced candidates.
ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS website text;



-- === 20260118043000_sourced_leads.sql ===
-- Leads table for web-sourced discovery (store URLs/snippets first; enrich later; then convert to candidates).

CREATE TABLE IF NOT EXISTS public.sourced_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source text NOT NULL DEFAULT 'google_xray',
  search_query text,

  linkedin_url text NOT NULL,
  source_url text,
  title text,
  snippet text,

  match_score integer,
  matched_terms text[],

  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'enrichment_pending', 'enriched', 'failed', 'archived')),
  enrichment_error text,
  enriched_at timestamptz,

  candidate_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,

  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure org cannot store same LinkedIn profile multiple times
CREATE UNIQUE INDEX IF NOT EXISTS sourced_leads_org_linkedin_url_uniq
  ON public.sourced_leads(organization_id, linkedin_url);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sourced_leads_set_updated_at ON public.sourced_leads;
CREATE TRIGGER trg_sourced_leads_set_updated_at
BEFORE UPDATE ON public.sourced_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.sourced_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org leads" ON public.sourced_leads
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org leads" ON public.sourced_leads
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update org leads" ON public.sourced_leads
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org leads" ON public.sourced_leads
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );



-- === 20260126090000_applications_status_add_reviewing_screening.sql ===
-- Allow additional pipeline stages on applications.status
-- (UI uses "reviewing" + "screening"; older rows may still have "reviewed")

DO $$
DECLARE
  r record;
BEGIN
  -- Drop any existing CHECK constraints that mention the status column
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'applied',
    'reviewing',
    'reviewed',
    'screening',
    'shortlisted',
    'interviewing',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
  )
);



-- === 20260127090000_engagement_workflow_v2.sql ===
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



-- === 20260127100000_fix_candidate_engagements_on_conflict.sql ===
-- Fix: allow ON CONFLICT (organization_id, candidate_id, job_id) upserts.
-- Postgres ON CONFLICT requires a unique index/constraint that matches the conflict target exactly.
-- A partial unique index (WHERE job_id IS NOT NULL) does NOT match and causes:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'candidate_engagements_org_candidate_job_uniq'
  ) THEN
    DROP INDEX public.candidate_engagements_org_candidate_job_uniq;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'candidate_engagements_org_candidate_job_uniq_full'
  ) THEN
    DROP INDEX public.candidate_engagements_org_candidate_job_uniq_full;
  END IF;
END $$;

-- Note: unique indexes allow multiple NULLs in job_id, which is fine for legacy/placeholder engagements.
-- Job-scoped engagements always set job_id, so this provides the needed conflict target for upserts.
CREATE UNIQUE INDEX candidate_engagements_org_candidate_job_uniq_full
ON public.candidate_engagements (organization_id, candidate_id, job_id);



-- === 20260127120000_account_manager_recruiter_assignments.sql ===
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



-- === 20260127124000_account_manager_can_view_org_candidates.sql ===
-- Allow account managers to view candidates linked to their org.
-- Needed for AM oversight views like Engagement Pipeline (candidate_profiles join).

DROP POLICY IF EXISTS "Account managers can view org candidates via links" ON public.candidate_profiles;
CREATE POLICY "Account managers can view org candidates via links"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_org_links col
    WHERE col.candidate_id = public.candidate_profiles.id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);



-- === 20260127130000_backfill_missing_profiles.sql ===
-- Backfill missing public.profiles rows for existing auth.users.
-- This prevents UI fallbacks like "Candidate" when profiles are missing.

INSERT INTO public.profiles (user_id, email, full_name)
SELECT
  u.id AS user_id,
  u.email AS email,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'User'
  ) AS full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
  AND u.email IS NOT NULL;



-- === 20260127130500_org_admin_link_candidate_ensures_profile.sql ===
-- Ensure org-admin linking creates a corresponding public.profiles row if missing.

CREATE OR REPLACE FUNCTION public.org_admin_link_candidate_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  org_id uuid;
  cp_id uuid;
  target_email text;
  inferred_name text;
BEGIN
  IF NOT has_role(auth.uid(), 'org_admin') THEN
    RAISE EXCEPTION 'Only org admins can link candidates';
  END IF;

  org_id := get_user_organization(auth.uid());
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Org admin has no organization';
  END IF;

  SELECT id, email,
         COALESCE(
           NULLIF(raw_user_meta_data->>'full_name',''),
           NULLIF(raw_user_meta_data->>'name',''),
           NULLIF(split_part(email, '@', 1), ''),
           'Candidate'
         )
  INTO target_user_id, target_email, inferred_name
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure profiles row exists (some legacy users may miss it)
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (target_user_id, target_email, inferred_name)
  ON CONFLICT (user_id) DO NOTHING;

  -- Ensure candidate_profile exists
  INSERT INTO public.candidate_profiles (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO cp_id FROM public.candidate_profiles WHERE user_id = target_user_id;

  INSERT INTO public.candidate_org_links (candidate_id, organization_id, link_type, status, created_by)
  VALUES (cp_id, org_id, 'org_admin_link', 'active', auth.uid())
  ON CONFLICT (candidate_id, organization_id) DO UPDATE
    SET status = 'active', link_type = 'org_admin_link', created_by = auth.uid();

  RETURN target_user_id;
END;
$$;



-- === 20260127131000_org_admin_can_view_candidate_profiles.sql ===
-- Allow org admins to view candidate user profiles linked to their org.
-- Without this, Org Admin "All Users" shows candidates as "Candidate" because profiles RLS blocks access.

DROP POLICY IF EXISTS "Org admins can view candidate profiles via links" ON public.profiles;
CREATE POLICY "Org admins can view candidate profiles via links"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.candidate_profiles cp
    JOIN public.candidate_org_links col
      ON col.candidate_id = cp.id
    WHERE cp.user_id = public.profiles.user_id
      AND col.organization_id = get_user_organization(auth.uid())
      AND col.status = 'active'
  )
);



-- === 20260128120000_account_manager_resume_and_applications_access.sql ===
-- Account Manager: same access as recruiter for org candidates' resumes and applications
-- Fixes: (1) AM sees same profile count as recruiter (applications SELECT), (2) AM sees resume link in drawer (resumes table + storage)

-- 1) Applications: allow account_manager to view applications for their org's jobs (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view applications for their organization jobs" ON public.applications;
CREATE POLICY "Staff can view applications for their organization jobs"
ON public.applications
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);

-- 2) Resumes table: allow account_manager to view resumes of org-accessible candidates (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view resumes of accessible candidates" ON public.resumes;
CREATE POLICY "Staff can view resumes of accessible candidates"
ON public.resumes
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

-- 3) Storage: allow account_manager to view sourced resumes (same as recruiter)
DROP POLICY IF EXISTS "Recruiters can view sourced resumes" ON storage.objects;
CREATE POLICY "Staff can view sourced resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
);

-- 4) Storage: allow account_manager to view accessible candidate resumes (user_id-based paths)
DROP POLICY IF EXISTS "Recruiters can view accessible candidate resumes" ON storage.objects;
CREATE POLICY "Staff can view accessible candidate resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND (
    (storage.foldername(name))[1]::uuid IN (
      SELECT cp.user_id FROM public.candidate_profiles cp
      WHERE public.recruiter_can_access_candidate(cp.id) AND cp.user_id IS NOT NULL
    )
  )
);


-- === 20260128120100_account_manager_upload_sourced_resumes.sql ===
-- Account Manager: allow upload to sourced folder (same as recruiter)
-- Fixes: AM upload fails with "new row violates row-level security policy"

DROP POLICY IF EXISTS "Recruiters can upload sourced resumes" ON storage.objects;
CREATE POLICY "Staff can upload sourced resumes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND (storage.foldername(name))[1] = 'sourced'
);


-- === 20260128130000_account_manager_candidate_detail_tables.sql ===
-- Allow account_manager to view candidate skills, experience, and education in the detail drawer
-- (same as recruiter: org-accessible + marketplace when enabled).
-- Without this, AM only sees summary, status, and resume in TalentDetailSheet.

-- candidate_skills: staff (recruiter or account_manager) can view skills for org + marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view candidate skills (org + marketplace)" ON public.candidate_skills;
CREATE POLICY "Staff can view candidate skills (org + marketplace)"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

-- candidate_experience: staff can view experience for org + marketplace candidates
DROP POLICY IF EXISTS "Recruiters can view candidate experience (org + marketplace)" ON public.candidate_experience;
CREATE POLICY "Staff can view candidate experience (org + marketplace)"
ON public.candidate_experience
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND (
      public.recruiter_can_access_candidate(candidate_id)
      OR public.recruiter_can_view_marketplace_candidate(candidate_id)
    )
  )
);

-- candidate_education: staff can view education for org-accessible candidates
DROP POLICY IF EXISTS "Recruiters can view education of accessible candidates" ON public.candidate_education;
CREATE POLICY "Staff can view education of accessible candidates"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  OR (
    (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
    AND public.recruiter_can_access_candidate(candidate_id)
  )
);


-- === 20260128140000_account_manager_can_view_marketplace_candidates.sql ===
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


-- === 20260128150000_account_manager_view_org_user_roles.sql ===
-- Ensure account managers can view all user_roles in their org (My Team page).
-- This may already be granted by "Managers can view org user roles"; adding an explicit
-- policy so prod environments where that policy is missing or different still work.

DROP POLICY IF EXISTS "Account managers can view org user roles" ON public.user_roles;
CREATE POLICY "Account managers can view org user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);


-- === 20260128160000_account_manager_view_org_profiles.sql ===
-- Account managers: allow viewing profiles of all org members (My Team page).
-- Uses a SECURITY DEFINER function so the profile check does not depend on RLS
-- when evaluating the user_roles subquery (avoids prod visibility issues).

CREATE OR REPLACE FUNCTION public.get_org_member_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.organization_id = get_user_organization(auth.uid())
    AND ur.organization_id IS NOT NULL;
$$;

-- Allow account managers to read profiles of everyone in their org (team list).
DROP POLICY IF EXISTS "Account managers can view org member profiles" ON public.profiles;
CREATE POLICY "Account managers can view org member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND user_id IN (SELECT public.get_org_member_user_ids())
);


-- === 20260128170000_profiles_first_last_name.sql ===
-- Add first_name and last_name to profiles for admin (and other) profile editing.
-- full_name remains for display/backward compatibility; can be synced from first + last when provided.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN public.profiles.first_name IS 'Admin/candidate first name; optional.';
COMMENT ON COLUMN public.profiles.last_name IS 'Admin/candidate last name; optional.';

-- RPC so users can update their own profile (first_name, last_name, phone, full_name) without RLS blocking.
-- Wrapped in DO so migration does not fail when the function is owned by another role (e.g. created in Dashboard).
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text, text);
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION public.update_own_profile(
      _first_name text DEFAULT NULL,
      _last_name text DEFAULT NULL,
      _phone text DEFAULT NULL,
      _full_name text DEFAULT NULL
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      _uid uuid := auth.uid();
      _computed_full_name text;
    BEGIN
      IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      _computed_full_name := COALESCE(
        NULLIF(trim(_full_name), ''),
        CASE WHEN trim(_first_name) IS NOT NULL OR trim(_last_name) IS NOT NULL
          THEN trim(COALESCE(_first_name, '') || ' ' || COALESCE(_last_name, ''))
          ELSE (SELECT full_name FROM public.profiles WHERE user_id = _uid LIMIT 1)
        END
      );

      UPDATE public.profiles
      SET
        first_name = NULLIF(trim(_first_name), ''),
        last_name = NULLIF(trim(_last_name), ''),
        phone = NULLIF(trim(_phone), ''),
        full_name = COALESCE(_computed_full_name, full_name),
        updated_at = now()
      WHERE user_id = _uid;
    END;
    $fn$
  $exec$;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;


-- === 20260128180000_candidate_invites.sql ===
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


-- === 20260128190000_job_recruiter_assignments.sql ===
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


-- === 20260128240000_get_talent_pool_candidate_ids_rpc.sql ===
-- RPC: talent pool candidate IDs for current user's org (avoids RLS org mismatch).
-- Read-only; no existing tables or policies changed.

CREATE OR REPLACE FUNCTION public.get_talent_pool_candidate_ids()
RETURNS TABLE(candidate_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_org AS (
    SELECT ur.organization_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id IS NOT NULL
      AND ur.role IN ('recruiter'::app_role, 'account_manager'::app_role)
    LIMIT 1
  ),
  sourced AS (
    SELECT col.candidate_id
    FROM public.candidate_org_links col
    INNER JOIN my_org o ON o.organization_id = col.organization_id
    WHERE col.status = 'active'
      AND col.link_type IN (
        'resume_upload', 'web_search', 'google_xray', 'linkedin_search',
        'sourced_resume', 'sourced_web', 'sourced', 'unknown', 'application'
      )
  ),
  applicants AS (
    SELECT a.candidate_id
    FROM public.applications a
    INNER JOIN public.jobs j ON j.id = a.job_id
    INNER JOIN my_org o ON o.organization_id = j.organization_id
  )
  SELECT DISTINCT candidate_id FROM sourced
  UNION
  SELECT DISTINCT candidate_id FROM applicants;
$$;

GRANT EXECUTE ON FUNCTION public.get_talent_pool_candidate_ids() TO authenticated;


-- === 20260128250000_fix_jobs_rls_recursion.sql ===
-- Fix infinite recursion between jobs and job_recruiter_assignments RLS.
-- Cause: jobs SELECT policy checks EXISTS (SELECT from job_recruiter_assignments);
--        job_recruiter_assignments policy checks EXISTS (SELECT from jobs).
-- Fix: Use a SECURITY DEFINER function to resolve job organization without triggering jobs RLS.

-- 1) Function to get job's organization_id without going through jobs RLS (breaks cycle).
CREATE OR REPLACE FUNCTION public.job_organization_id(p_job_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.jobs WHERE id = p_job_id LIMIT 1;
$$;

-- 2) Replace job_recruiter_assignments policy so it does not SELECT from jobs (avoids recursion).
DROP POLICY IF EXISTS "AM and org admin can manage job recruiter assignments" ON public.job_recruiter_assignments;
CREATE POLICY "AM and org admin can manage job recruiter assignments"
ON public.job_recruiter_assignments
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND public.job_organization_id(job_id) = get_user_organization(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND public.job_organization_id(job_id) = get_user_organization(auth.uid())
);


-- === 20260128260000_talent_pool_recruiter_scope.sql ===
-- Recruiters see only their own sourced candidates + applicants to jobs they own or are assigned to.
-- AM/org_admin continue to see all org candidates in the talent pool.

CREATE OR REPLACE FUNCTION public.get_talent_pool_candidate_ids()
RETURNS TABLE(candidate_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_org AS (
    SELECT ur.organization_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id IS NOT NULL
      AND ur.role IN ('recruiter'::app_role, 'account_manager'::app_role)
    LIMIT 1
  ),
  sourced AS (
    SELECT col.candidate_id
    FROM public.candidate_org_links col
    INNER JOIN my_org o ON o.organization_id = col.organization_id
    WHERE col.status = 'active'
      AND col.link_type IN (
        'resume_upload', 'web_search', 'google_xray', 'linkedin_search',
        'sourced_resume', 'sourced_web', 'sourced', 'unknown', 'application'
      )
      AND (
        has_role(auth.uid(), 'account_manager'::app_role)
        OR has_role(auth.uid(), 'org_admin'::app_role)
        OR col.created_by = auth.uid()
      )
  ),
  -- Applicants: candidate belongs to job owner. Recruiter sees only applicants to jobs they own (not assigned).
  applicants AS (
    SELECT a.candidate_id
    FROM public.applications a
    INNER JOIN public.jobs j ON j.id = a.job_id
    INNER JOIN my_org o ON o.organization_id = j.organization_id
    WHERE has_role(auth.uid(), 'account_manager'::app_role)
       OR has_role(auth.uid(), 'org_admin'::app_role)
       OR j.recruiter_id = auth.uid()
  )
  SELECT DISTINCT candidate_id FROM sourced
  UNION
  SELECT DISTINCT candidate_id FROM applicants;
$$;


-- === 20260128270000_staff_can_create_application_for_engagement.sql ===
-- Allow recruiters and AM to create an application when they start an engagement with a candidate for a job.
-- This makes the candidate "belong" to that job (and its owner) so they show in My Candidates and Engagement Pipeline.

CREATE POLICY "Staff can create applications for their organization jobs"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);


-- === 20260128280000_engagement_ensures_application.sql ===
-- Ensure every candidate_engagement has a matching application so the candidate shows in
-- My Applicants for the job owner. Fixes: engagement exists (pipeline) but no application row.

-- 1) Backfill: create application rows for existing engagements that don't have one (SECURITY DEFINER so migration can run)
CREATE OR REPLACE FUNCTION public.backfill_applications_for_engagements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    SELECT e.job_id, e.candidate_id, 'outreach', COALESCE(e.created_at, now())
    FROM public.candidate_engagements e
    WHERE e.job_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.job_id = e.job_id AND a.candidate_id = e.candidate_id
      )
    ON CONFLICT (job_id, candidate_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

SELECT public.backfill_applications_for_engagements();

DROP FUNCTION public.backfill_applications_for_engagements();

-- 2) Trigger: when an engagement is created, ensure an application exists (runs as invoking user so RLS applies)
CREATE OR REPLACE FUNCTION public.ensure_application_for_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    VALUES (NEW.job_id, NEW.candidate_id, 'outreach', COALESCE(NEW.created_at, now()))
    ON CONFLICT (job_id, candidate_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_application_for_engagement ON public.candidate_engagements;
CREATE TRIGGER trg_ensure_application_for_engagement
  AFTER INSERT ON public.candidate_engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_application_for_engagement();


-- === 20260128290000_applications_status_engaged.sql ===
-- Single pipeline: one ordered list of stages in applications.status.
-- Two entry points: (1) Public apply → status 'applied'. (2) Recruiter starts engagement → status 'outreach'.
-- All candidates then move through the same stages. Engagement rows kept for email/requests; stage synced to application.status.

-- Migrate any rows that used the old 'engaged' status to 'outreach'
UPDATE public.applications SET status = 'outreach' WHERE status = 'engaged';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'rate_confirmation',
    'right_to_represent',
    'applied',
    'reviewing',
    'reviewed',
    'screening',
    'shortlisted',
    'interviewing',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
  )
);


-- === 20260128300000_pipeline_stages_consulting.sql ===
-- Simplify pipeline to consulting stage gates:
-- outreach → applied → document_check → screening → rtr_rate → submission → client_shortlist → client_interview → offered → hired | rejected | withdrawn
-- Map existing statuses to the new set. Drop constraint first so UPDATEs to new values succeed, then re-add.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.applications SET status = 'rtr_rate' WHERE status IN ('rate_confirmation', 'right_to_represent');
UPDATE public.applications SET status = 'document_check' WHERE status IN ('reviewing', 'reviewed');
UPDATE public.applications SET status = 'submission' WHERE status = 'shortlisted';
UPDATE public.applications SET status = 'client_interview' WHERE status = 'interviewing';

ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'applied',
    'document_check',
    'screening',
    'rtr_rate',
    'submission',
    'client_shortlist',
    'client_interview',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
  )
);


-- === 20260129100000_recruiter_can_view_org_user_roles.sql ===
-- No-op: this migration previously added RLS policies that broke login (circular dependency).
-- Account managers in the pipeline dropdown are now provided by get-org-account-managers edge function only.
SELECT 1;


-- === 20260129110000_revert_recruiter_view_org_roles.sql ===
-- No-op: reverted the policies from 20260129100000; fix and restore of own-role/own-profile is in 20260129120000.
SELECT 1;


-- === 20260129120000_ensure_own_roles_and_profile_visible.sql ===
-- Restore login: ensure users can read their own user_roles and profile.
--
-- The account-managers dropdown in the pipeline is fixed via the
-- get-org-account-managers edge function only (no RLS changes). This migration
-- only removes any leftover broad policies and restores the two base policies
-- required for auth/role resolution.

-- 1) Remove org-wide policies that caused RLS recursion (if they exist).
DROP POLICY IF EXISTS "Org members can view user_roles in same org" ON public.user_roles;
DROP POLICY IF EXISTS "Org members can view org member profiles" ON public.profiles;

-- 2) Restore: users must see their own user_roles rows (required for login).
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3) Restore: users must see their own profile.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- === 20260130100000_recruiter_pipeline_ends_at_submission_outcome.sql ===
-- Recruiter pipeline ends at Submission; after that one stage "Outcome" (final_update) with sub-values.
-- Manager pipeline (future) starts at Submission. Applications get outcome when recruiter records manager feedback.

-- 1) Add outcome column (nullable; set when status = final_update)
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS outcome TEXT;

COMMENT ON COLUMN public.applications.outcome IS 'When status=final_update: client_rejected, job_offered, candidate_declined, withdrawn, hired';

-- 2) Drop existing status check constraint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 3) Map old statuses to final_update + outcome (and any other legacy values to a valid stage)
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'rejected';
UPDATE public.applications SET status = 'final_update', outcome = 'withdrawn' WHERE status = 'withdrawn';
UPDATE public.applications SET status = 'final_update', outcome = 'job_offered' WHERE status = 'offered';
UPDATE public.applications SET status = 'final_update', outcome = 'hired' WHERE status = 'hired';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'client_shortlist';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status = 'client_interview';
-- Legacy values from older migrations (if any rows still have them)
UPDATE public.applications SET status = 'rtr_rate' WHERE status IN ('rate_confirmation', 'right_to_represent');
UPDATE public.applications SET status = 'document_check' WHERE status IN ('reviewing', 'reviewed');
UPDATE public.applications SET status = 'submission' WHERE status = 'shortlisted';
UPDATE public.applications SET status = 'final_update', outcome = 'client_rejected' WHERE status IN ('interviewing', 'interview');
UPDATE public.applications SET status = 'final_update', outcome = NULL WHERE status NOT IN ('outreach','applied','rtr_rate','document_check','screening','submission','final_update');

-- 4) Re-add constraint: recruiter pipeline statuses only
ALTER TABLE public.applications
ADD CONSTRAINT applications_status_check
CHECK (
  status IN (
    'outreach',
    'applied',
    'rtr_rate',
    'document_check',
    'screening',
    'submission',
    'final_update'
  )
);

-- 5) Optional: check outcome when status is final_update (allow null for "pending")
ALTER TABLE public.applications
ADD CONSTRAINT applications_outcome_check
CHECK (
  (status <> 'final_update' AND outcome IS NULL)
  OR
  (status = 'final_update' AND (outcome IS NULL OR outcome IN ('client_rejected','job_offered','candidate_declined','withdrawn','hired')))
);

CREATE INDEX IF NOT EXISTS idx_applications_outcome ON public.applications(outcome) WHERE outcome IS NOT NULL;


-- === 20260131100000_account_manager_can_update_candidate_notes.sql ===
-- Allow account managers to update recruiter_notes on candidate_profiles for org-accessible
-- candidates so they can add/edit comments when viewing a recruiter's pipeline (they still cannot move candidates).

DROP POLICY IF EXISTS "Account managers can update candidate notes for org candidates" ON public.candidate_profiles;

CREATE POLICY "Account managers can update candidate notes for org candidates"
ON public.candidate_profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND public.recruiter_can_access_candidate(id)
)
WITH CHECK (
  has_role(auth.uid(), 'account_manager'::app_role)
  AND public.recruiter_can_access_candidate(id)
);


-- === 20260131110000_staff_update_candidate_notes_rpc.sql ===
-- Update candidate_profiles.recruiter_notes via RPC so both recruiters and account managers
-- can save comments (RLS UPDATE can be flaky for AM). Caller must have staff role and access to the candidate.

CREATE OR REPLACE FUNCTION public.update_candidate_recruiter_notes(_candidate_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can update candidate notes';
  END IF;

  IF NOT public.recruiter_can_access_candidate(_candidate_id) THEN
    RAISE EXCEPTION 'You do not have access to this candidate';
  END IF;

  UPDATE public.candidate_profiles
  SET recruiter_notes = NULLIF(trim(_notes), '')
  WHERE id = _candidate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;
END;
$$;

-- Allow authenticated users (recruiter/AM/org_admin) to call the RPC; the function itself checks role and access.
GRANT EXECUTE ON FUNCTION public.update_candidate_recruiter_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_candidate_recruiter_notes(uuid, text) TO service_role;


-- === 20260207120000_fix_engagement_rls_for_staff.sql ===
-- Fix "new row violates row level security" when starting engagement (e.g. recruiter who switched from AM).
-- 1) Trigger that ensures application for engagement: run as DEFINER so it can always insert (bypasses RLS).
-- 2) Applications UPDATE: allow account_manager and org_admin (not just recruiter) so staff can upsert.

-- 1) ensure_application_for_engagement: SECURITY DEFINER so trigger insert is not blocked by RLS
CREATE OR REPLACE FUNCTION public.ensure_application_for_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
    VALUES (NEW.job_id, NEW.candidate_id, 'outreach', COALESCE(NEW.created_at, now()))
    ON CONFLICT (job_id, candidate_id) DO UPDATE SET
      status = 'outreach',
      applied_at = COALESCE(EXCLUDED.applied_at, now());
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Applications UPDATE: allow all staff (recruiter, account_manager, org_admin) for org jobs
DROP POLICY IF EXISTS "Recruiters can update applications for their organization jobs" ON public.applications;

CREATE POLICY "Staff can update applications for their organization jobs"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role) OR has_role(auth.uid(), 'org_admin'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);


-- === 20260207130000_start_engagement_rpc.sql ===
-- Start engagement via RPC so RLS cannot block (recruiter or AM who switched to recruiter).
-- Performs engagement upsert + application upsert in one SECURITY DEFINER call.

CREATE OR REPLACE FUNCTION public.start_engagement(_candidate_id uuid, _job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _user_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    has_role(_user_id, 'recruiter'::app_role)
    OR has_role(_user_id, 'account_manager'::app_role)
    OR has_role(_user_id, 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can start engagements';
  END IF;

  _org_id := get_user_organization(_user_id);
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = _job_id AND organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'Job not found or not in your organization';
  END IF;

  IF NOT public.recruiter_can_access_candidate(_candidate_id) THEN
    RAISE EXCEPTION 'You do not have access to this candidate';
  END IF;

  INSERT INTO public.candidate_engagements (
    organization_id,
    candidate_id,
    job_id,
    stage,
    created_by,
    owner_user_id
  )
  VALUES (
    _org_id,
    _candidate_id,
    _job_id,
    'outreach',
    _user_id,
    _user_id
  )
  ON CONFLICT (organization_id, candidate_id, job_id)
  DO UPDATE SET
    stage = 'outreach',
    updated_at = now();

  INSERT INTO public.applications (job_id, candidate_id, status, applied_at)
  VALUES (_job_id, _candidate_id, 'outreach', now())
  ON CONFLICT (job_id, candidate_id)
  DO UPDATE SET
    status = 'outreach',
    applied_at = now();

  -- So talent pool row stage dropdown reflects pipeline (e.g. "Engaged" / outreach)
  UPDATE public.candidate_profiles
  SET recruiter_status = 'outreach'
  WHERE id = _candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_engagement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_engagement(uuid, uuid) TO service_role;


-- === 20260207140000_update_application_status_rpc.sql ===
-- Update application status (and optionally candidate_profiles) via RPC so staff (recruiter/AM/org_admin)
-- can always move candidates in the pipeline without RLS blocking.

CREATE OR REPLACE FUNCTION public.update_application_status(
  _application_id uuid,
  _status text,
  _candidate_id uuid DEFAULT NULL,
  _outcome text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_id uuid;
  _app_candidate_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can update application status';
  END IF;

  SELECT job_id, candidate_id INTO _job_id, _app_candidate_id
  FROM public.applications
  WHERE id = _application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = _job_id AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Application job not in your organization';
  END IF;

  -- When moving off Outcome (final_update), clear outcome so applications_outcome_check is satisfied.
  UPDATE public.applications
  SET
    status = _status,
    outcome = CASE WHEN _status = 'final_update' THEN _outcome ELSE NULL END
  WHERE id = _application_id;

  IF _candidate_id IS NOT NULL AND public.recruiter_can_access_candidate(_candidate_id) THEN
    IF _recruiter_notes IS NOT NULL THEN
      UPDATE public.candidate_profiles
      SET recruiter_status = _status, recruiter_notes = NULLIF(trim(_recruiter_notes), '')
      WHERE id = _candidate_id;
    ELSE
      UPDATE public.candidate_profiles
      SET recruiter_status = _status
      WHERE id = _candidate_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status(uuid, text, uuid, text, text) TO service_role;


-- === 20260207150000_fix_update_application_status_clear_outcome.sql ===
-- Fix: when moving from Outcome (final_update) back to Submission (or any other stage),
-- clear outcome so applications_outcome_check (outcome IS NULL when status <> 'final_update') is satisfied.

CREATE OR REPLACE FUNCTION public.update_application_status(
  _application_id uuid,
  _status text,
  _candidate_id uuid DEFAULT NULL,
  _outcome text DEFAULT NULL,
  _recruiter_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_id uuid;
  _app_candidate_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only recruiters and account managers can update application status';
  END IF;

  SELECT job_id, candidate_id INTO _job_id, _app_candidate_id
  FROM public.applications
  WHERE id = _application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = _job_id AND organization_id = get_user_organization(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Application job not in your organization';
  END IF;

  -- When moving off Outcome (final_update), clear outcome so applications_outcome_check is satisfied.
  UPDATE public.applications
  SET
    status = _status,
    outcome = CASE WHEN _status = 'final_update' THEN _outcome ELSE NULL END
  WHERE id = _application_id;

  IF _candidate_id IS NOT NULL AND public.recruiter_can_access_candidate(_candidate_id) THEN
    IF _recruiter_notes IS NOT NULL THEN
      UPDATE public.candidate_profiles
      SET recruiter_status = _status, recruiter_notes = NULLIF(trim(_recruiter_notes), '')
      WHERE id = _candidate_id;
    ELSE
      UPDATE public.candidate_profiles
      SET recruiter_status = _status
      WHERE id = _candidate_id;
    END IF;
  END IF;
END;
$$;


