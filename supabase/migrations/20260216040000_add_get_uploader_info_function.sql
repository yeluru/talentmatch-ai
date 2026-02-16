-- Create a function to get uploader information for candidates
-- This works around the limitation that auth.users can't be joined directly via REST API

CREATE OR REPLACE FUNCTION public.get_uploaders_for_candidates(candidate_ids uuid[])
RETURNS TABLE (
  candidate_id uuid,
  uploader_email text,
  uploader_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id as candidate_id,
    au.email as uploader_email,
    COALESCE(au.raw_user_meta_data->>'full_name', au.email) as uploader_name
  FROM candidate_profiles cp
  LEFT JOIN auth.users au ON au.id = cp.uploaded_by_user_id
  WHERE cp.id = ANY(candidate_ids);
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_uploaders_for_candidates(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_uploaders_for_candidates IS 'Fetches uploader email and name for given candidate IDs. Returns NULL for candidates without an uploader.';
