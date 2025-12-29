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