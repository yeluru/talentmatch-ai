-- Allow recruiters to upload resumes to the sourced folder
CREATE POLICY "Recruiters can upload sourced resumes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' 
  AND has_role(auth.uid(), 'recruiter'::app_role)
  AND (storage.foldername(name))[1] = 'sourced'
);