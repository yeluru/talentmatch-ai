-- Add uploaded_by_user_id to candidate_profiles to track who uploaded each candidate
ALTER TABLE public.candidate_profiles
ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_uploaded_by
ON public.candidate_profiles(uploaded_by_user_id);

-- Backfill existing candidates with uploader from audit_logs
-- This finds the first upload_resume action for each candidate
UPDATE public.candidate_profiles cp
SET uploaded_by_user_id = (
  SELECT al.user_id
  FROM public.audit_logs al
  WHERE al.entity_type = 'resumes'
    AND al.action = 'upload_resume'
    AND al.entity_id::text = cp.id::text
  ORDER BY al.created_at ASC
  LIMIT 1
)
WHERE uploaded_by_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.audit_logs al
    WHERE al.entity_type = 'resumes'
      AND al.action = 'upload_resume'
      AND al.entity_id::text = cp.id::text
  );

-- Add comment
COMMENT ON COLUMN public.candidate_profiles.uploaded_by_user_id IS 'User who uploaded/sourced this candidate';
