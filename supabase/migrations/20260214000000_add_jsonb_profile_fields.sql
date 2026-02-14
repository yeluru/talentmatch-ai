-- Migration: Add JSONB fields for rich profile data from resume parsing
-- Purpose: Store experience, education, skills as JSONB for easier import from external sources
-- Date: 2026-02-14

-- Add JSONB columns to candidate_profiles
ALTER TABLE candidate_profiles
ADD COLUMN IF NOT EXISTS experience jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS education jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS soft_skills jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resume_url text,
ADD COLUMN IF NOT EXISTS resume_text text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add comment explaining the fields
COMMENT ON COLUMN candidate_profiles.experience IS 'JSONB array of work experience objects with company, title, dates, bullets, etc.';
COMMENT ON COLUMN candidate_profiles.education IS 'JSONB array of education objects with institution, degree, field, dates, etc.';
COMMENT ON COLUMN candidate_profiles.skills IS 'JSONB array of technical skill strings';
COMMENT ON COLUMN candidate_profiles.soft_skills IS 'JSONB array of soft skill strings';
COMMENT ON COLUMN candidate_profiles.certifications IS 'JSONB array of certification strings';
COMMENT ON COLUMN candidate_profiles.resume_url IS 'Public URL to stored resume file (PDF, DOCX, etc.)';
COMMENT ON COLUMN candidate_profiles.resume_text IS 'Extracted text from resume for search/analysis';
COMMENT ON COLUMN candidate_profiles.source IS 'Import source: manual, linkedin_pdf, resume_upload, api, etc.';

-- Create GIN indexes for efficient JSONB querying
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_experience_gin ON candidate_profiles USING gin(experience);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_education_gin ON candidate_profiles USING gin(education);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_skills_gin ON candidate_profiles USING gin(skills);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_soft_skills_gin ON candidate_profiles USING gin(soft_skills);

-- Create index on source for filtering by import method
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_source ON candidate_profiles(source) WHERE source IS NOT NULL;

-- Create text search index on resume_text for full-text search
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_resume_text_search ON candidate_profiles USING gin(to_tsvector('english', COALESCE(resume_text, '')));

-- Update RLS policies to allow reading new fields (inherits from existing policies)
-- No changes needed - existing SELECT policies already cover all columns

-- Add helpful function to get experience count
CREATE OR REPLACE FUNCTION get_candidate_experience_count(candidate_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_array_length(COALESCE(experience, '[]'::jsonb))
  FROM candidate_profiles
  WHERE id = candidate_id;
$$;

-- Add helpful function to get total years of experience from JSONB
CREATE OR REPLACE FUNCTION calculate_years_from_experience_jsonb(exp jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  total_months integer := 0;
  job jsonb;
  start_str text;
  end_str text;
  start_date date;
  end_date date;
BEGIN
  -- Iterate through each job in the experience array
  FOR job IN SELECT * FROM jsonb_array_elements(exp)
  LOOP
    start_str := job->>'start';
    end_str := job->>'end';

    -- Skip if no dates
    IF start_str IS NULL THEN
      CONTINUE;
    END IF;

    -- Try to parse start date (handle various formats: YYYY, YYYY-MM, full date)
    BEGIN
      IF start_str ~ '^\d{4}-\d{2}' THEN
        start_date := (start_str || '-01')::date;
      ELSIF start_str ~ '^\d{4}$' THEN
        start_date := (start_str || '-01-01')::date;
      ELSE
        CONTINUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    -- Parse end date or use current date if null/empty/present
    IF end_str IS NULL OR end_str = '' OR LOWER(end_str) IN ('present', 'current') THEN
      end_date := CURRENT_DATE;
    ELSE
      BEGIN
        IF end_str ~ '^\d{4}-\d{2}' THEN
          end_date := (end_str || '-01')::date;
        ELSIF end_str ~ '^\d{4}$' THEN
          end_date := (end_str || '-12-31')::date;
        ELSE
          end_date := CURRENT_DATE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        end_date := CURRENT_DATE;
      END;
    END IF;

    -- Calculate months for this job
    total_months := total_months + EXTRACT(YEAR FROM age(end_date, start_date)) * 12
                                  + EXTRACT(MONTH FROM age(end_date, start_date));
  END LOOP;

  -- Convert to years (rounded)
  RETURN GREATEST(0, ROUND(total_months::numeric / 12));
END;
$$;

COMMENT ON FUNCTION calculate_years_from_experience_jsonb(jsonb) IS 'Calculate total years of experience from JSONB experience array';
