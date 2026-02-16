-- Table to track bulk upload sessions and their progress
CREATE TABLE IF NOT EXISTS public.bulk_upload_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Progress tracking
  total_files integer NOT NULL DEFAULT 0,
  processed_files integer NOT NULL DEFAULT 0,
  succeeded_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,

  -- Status
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled')),

  -- Metadata
  source text NOT NULL DEFAULT 'resume_upload',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Error tracking (JSONB array of error messages)
  errors jsonb DEFAULT '[]'::jsonb,

  -- Additional context
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_user_id ON public.bulk_upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_org_id ON public.bulk_upload_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_status ON public.bulk_upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_started_at ON public.bulk_upload_sessions(started_at DESC);

-- RLS Policies
ALTER TABLE public.bulk_upload_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own upload sessions
CREATE POLICY "Users can view own upload sessions"
  ON public.bulk_upload_sessions
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own upload sessions
CREATE POLICY "Users can create own upload sessions"
  ON public.bulk_upload_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own upload sessions
CREATE POLICY "Users can update own upload sessions"
  ON public.bulk_upload_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Account managers and org admins can see all sessions in their org
CREATE POLICY "Managers can view org upload sessions"
  ON public.bulk_upload_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = bulk_upload_sessions.organization_id
        AND ur.role IN ('account_manager'::app_role, 'org_admin'::app_role)
    )
  );

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION public.update_bulk_upload_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_bulk_upload_sessions_updated_at
  BEFORE UPDATE ON public.bulk_upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bulk_upload_sessions_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_sessions TO authenticated;
