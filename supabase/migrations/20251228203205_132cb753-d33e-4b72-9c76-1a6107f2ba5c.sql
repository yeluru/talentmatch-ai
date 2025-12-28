-- Allow recruiters to view/download sourced resumes
CREATE POLICY "Recruiters can view sourced resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'resumes' 
  AND has_role(auth.uid(), 'recruiter'::app_role)
);