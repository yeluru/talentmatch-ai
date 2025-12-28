-- Make the resumes bucket public so recruiters can view uploaded resumes
UPDATE storage.buckets SET public = true WHERE id = 'resumes';