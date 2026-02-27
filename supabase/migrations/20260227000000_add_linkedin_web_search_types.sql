-- Add linkedin_xray_basic, linkedin_xray_deep, and web_search to search_type constraint
-- This allows LinkedIn and Web searches to be properly categorized

ALTER TABLE public.talent_search_jobs 
DROP CONSTRAINT IF EXISTS check_search_type;

ALTER TABLE public.talent_search_jobs 
ADD CONSTRAINT check_search_type 
CHECK (search_type IN ('free_text', 'by_job', 'web_search', 'linkedin_xray_basic', 'linkedin_xray_deep'));

COMMENT ON COLUMN public.talent_search_jobs.search_type IS
'Type of search: free_text (instant), by_job (async background), web_search (external sources), linkedin_xray_basic (LinkedIn X-Ray basic), linkedin_xray_deep (LinkedIn X-Ray deep)';
