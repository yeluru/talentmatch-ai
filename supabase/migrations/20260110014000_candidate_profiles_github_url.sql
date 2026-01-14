-- Add GitHub profile URL to candidate_profiles for contact info.

ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS github_url text;

