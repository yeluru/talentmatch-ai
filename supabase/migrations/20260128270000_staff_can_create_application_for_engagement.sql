-- Allow recruiters and AM to create an application when they start an engagement with a candidate for a job.
-- This makes the candidate "belong" to that job (and its owner) so they show in My Candidates and Engagement Pipeline.

CREATE POLICY "Staff can create applications for their organization jobs"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'recruiter'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND job_id IN (
    SELECT id FROM public.jobs
    WHERE organization_id = get_user_organization(auth.uid())
  )
);
