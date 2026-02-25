-- Create async search jobs table for "Search by Job" feature
-- Allows background processing of large searches

CREATE TABLE IF NOT EXISTS public.talent_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  search_query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Search results
  results JSONB,
  total_candidates_searched INTEGER,
  matches_found INTEGER,

  -- Metadata
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_talent_search_jobs_org_status ON public.talent_search_jobs(organization_id, status);
CREATE INDEX idx_talent_search_jobs_created_by ON public.talent_search_jobs(created_by);
CREATE INDEX idx_talent_search_jobs_job_id ON public.talent_search_jobs(job_id);
CREATE INDEX idx_talent_search_jobs_created_at ON public.talent_search_jobs(created_at DESC);

-- RLS policies
ALTER TABLE public.talent_search_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view search jobs in their org"
  ON public.talent_search_jobs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create search jobs in their org"
  ON public.talent_search_jobs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('recruiter', 'account_manager')
    )
    AND created_by = auth.uid()
  );

COMMENT ON TABLE public.talent_search_jobs IS
'Async search jobs for Search by Job feature. Processes large talent searches in background.';
