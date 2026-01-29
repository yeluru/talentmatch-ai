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
