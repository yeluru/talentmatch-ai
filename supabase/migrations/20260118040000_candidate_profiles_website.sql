-- Add website/source link to candidate_profiles for web-sourced candidates.
ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS website text;

