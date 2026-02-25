-- Add DELETE policy for talent_search_jobs
-- Allows users to delete their own search history

CREATE POLICY "Users can delete their own search jobs"
  ON public.talent_search_jobs FOR DELETE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('recruiter', 'account_manager')
    )
  );

COMMENT ON POLICY "Users can delete their own search jobs" ON public.talent_search_jobs IS
'Allow users to delete searches they created or searches in their organization';
