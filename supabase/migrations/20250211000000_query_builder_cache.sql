-- Create table to store query builder state per job
CREATE TABLE IF NOT EXISTS public.query_builder_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Parsed data
  parsed_data JSONB NOT NULL DEFAULT '{}',

  -- Selected data
  selected_data JSONB NOT NULL DEFAULT '{}',

  -- Generated query
  generated_query TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Unique constraint: one cache entry per job per user
  UNIQUE(job_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_query_builder_cache_job_user
  ON public.query_builder_cache(job_id, user_id);

CREATE INDEX IF NOT EXISTS idx_query_builder_cache_org
  ON public.query_builder_cache(organization_id);

-- Enable RLS
ALTER TABLE public.query_builder_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own query cache"
  ON public.query_builder_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own query cache"
  ON public.query_builder_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own query cache"
  ON public.query_builder_cache FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own query cache"
  ON public.query_builder_cache FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_query_builder_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_query_builder_cache_updated_at
  BEFORE UPDATE ON public.query_builder_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_query_builder_cache_updated_at();
