-- Add saved talent searches table
CREATE TABLE IF NOT EXISTS saved_talent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  search_query TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add search history table
CREATE TABLE IF NOT EXISTS talent_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  search_query TEXT NOT NULL,
  parsed_filters JSONB DEFAULT '{}'::jsonb,
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add availability tracking to candidate_profiles
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS availability_status TEXT
  CHECK (availability_status IN ('actively_looking', 'open_to_opportunities', 'passive', 'not_looking'));

ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_org
  ON saved_talent_searches(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_saved_searches_favorite
  ON saved_talent_searches(organization_id, is_favorite)
  WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS idx_search_history_user_org
  ON talent_search_history(user_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_availability
  ON candidate_profiles(availability_status)
  WHERE availability_status IS NOT NULL;

-- Enable RLS
ALTER TABLE saved_talent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_search_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for saved_talent_searches
CREATE POLICY "Users can view saved searches in their org"
  ON saved_talent_searches FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own saved searches"
  ON saved_talent_searches FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own saved searches"
  ON saved_talent_searches FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own saved searches"
  ON saved_talent_searches FOR DELETE
  USING (user_id = auth.uid());

-- RLS policies for talent_search_history
CREATE POLICY "Users can view search history in their org"
  ON talent_search_history FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own search history"
  ON talent_search_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_search_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating timestamp
DROP TRIGGER IF EXISTS saved_searches_updated_at ON saved_talent_searches;
CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON saved_talent_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_search_timestamp();
