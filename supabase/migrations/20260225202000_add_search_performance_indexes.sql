-- Add indexes to optimize talent search performance
-- Prevents statement timeout errors with large candidate datasets

-- Index for skill name searches (ILIKE queries)
-- Uses pg_trgm for faster pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_candidate_skills_skill_name_trgm
  ON public.candidate_skills
  USING gin (skill_name gin_trgm_ops);

-- Composite index for org-scoped candidate queries
CREATE INDEX IF NOT EXISTS idx_candidate_org_links_org_status_candidate
  ON public.candidate_org_links(organization_id, status, candidate_id);

-- Index for candidate profile lookups
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_id
  ON public.candidate_profiles(id);

-- Index for current_title searches (used in role filtering)
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_current_title_trgm
  ON public.candidate_profiles
  USING gin (current_title gin_trgm_ops);

-- Index for location searches
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_location_trgm
  ON public.candidate_profiles
  USING gin (location gin_trgm_ops);

COMMENT ON INDEX idx_candidate_skills_skill_name_trgm IS
'Trigram index for fast skill name pattern matching in talent searches';

COMMENT ON INDEX idx_candidate_org_links_org_status_candidate IS
'Composite index for org-scoped candidate filtering with active status';
