-- Fix 1: Make resumes bucket private and add proper storage policies
UPDATE storage.buckets SET public = false WHERE id = 'resumes';

-- Drop any existing policies on storage.objects for resumes bucket
DROP POLICY IF EXISTS "Allow public read for resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can view accessible candidate resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;

-- Policy: Users can upload their own resumes (folder structure: user_id/filename)
CREATE POLICY "Users can upload their own resumes" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view their own resumes
CREATE POLICY "Users can view their own resumes" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Recruiters can view resumes of candidates they have access to
CREATE POLICY "Recruiters can view accessible candidate resumes" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes' AND 
  has_role(auth.uid(), 'recruiter') AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT cp.user_id FROM candidate_profiles cp 
    WHERE recruiter_can_access_candidate(cp.id) AND cp.user_id IS NOT NULL
  )
);

-- Policy: Users can update their own resumes
CREATE POLICY "Users can update their own resumes" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own resumes
CREATE POLICY "Users can delete their own resumes" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);