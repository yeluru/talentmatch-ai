-- Remove the auto-process trigger that's causing "schema net does not exist" error
-- The talent-search function already invokes the processor directly via fetch()

DROP TRIGGER IF EXISTS auto_process_search_job ON talent_search_jobs;
DROP FUNCTION IF EXISTS trigger_search_processor();

COMMENT ON TABLE talent_search_jobs IS
'Background processor is invoked directly by talent-search edge function, not via trigger';
