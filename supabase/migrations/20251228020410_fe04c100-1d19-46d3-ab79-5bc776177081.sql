-- Add full_name and contact columns to candidate_profiles for sourced profiles
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS ats_score integer;