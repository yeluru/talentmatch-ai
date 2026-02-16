-- Table to track individual files in bulk upload sessions
-- This enables resumable uploads by tracking which files have been processed
CREATE TABLE IF NOT EXISTS public.bulk_upload_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.bulk_upload_sessions(id) ON DELETE CASCADE,

  -- File identification
  file_name text NOT NULL,
  file_hash text NOT NULL, -- SHA-256 hash of file content
  file_size bigint,

  -- Processing status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  -- Result
  candidate_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  resume_id uuid,
  error_message text,

  -- Timestamps
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bulk_upload_files_session_id ON public.bulk_upload_files(session_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_files_file_hash ON public.bulk_upload_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_files_status ON public.bulk_upload_files(status);

-- Composite index for finding duplicate files in session
CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_upload_files_session_hash
  ON public.bulk_upload_files(session_id, file_hash);

-- RLS Policies (inherit from session)
ALTER TABLE public.bulk_upload_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view files in their sessions"
  ON public.bulk_upload_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_sessions s
      WHERE s.id = bulk_upload_files.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert files in their sessions"
  ON public.bulk_upload_files
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_sessions s
      WHERE s.id = bulk_upload_files.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update files in their sessions"
  ON public.bulk_upload_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_sessions s
      WHERE s.id = bulk_upload_files.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_sessions s
      WHERE s.id = bulk_upload_files.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Managers can view files in org sessions
CREATE POLICY "Managers can view org upload files"
  ON public.bulk_upload_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bulk_upload_sessions s
      INNER JOIN public.user_roles ur ON ur.organization_id = s.organization_id
      WHERE s.id = bulk_upload_files.session_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('account_manager'::app_role, 'org_admin'::app_role)
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_files TO authenticated;
