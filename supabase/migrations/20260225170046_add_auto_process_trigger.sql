-- Auto-trigger background processor when search job is created
-- This is more reliable than edge-to-edge function invocations

-- Function to trigger processor via HTTP
CREATE OR REPLACE FUNCTION trigger_search_processor()
RETURNS TRIGGER AS $$
DECLARE
  service_role_key text;
  supabase_url text;
  http_response text;
BEGIN
  -- Only trigger for new pending jobs
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status != 'pending') THEN
    -- Get environment variables (these must be set in Supabase dashboard)
    service_role_key := current_setting('app.settings.service_role_key', true);
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- Use pg_net to invoke the edge function asynchronously
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/process-talent-search-job',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object('searchJobId', NEW.id::text)
    );
    
    RAISE NOTICE 'Triggered processor for search job: %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS auto_process_search_job ON talent_search_jobs;
CREATE TRIGGER auto_process_search_job
  AFTER INSERT OR UPDATE ON talent_search_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_search_processor();

COMMENT ON FUNCTION trigger_search_processor() IS
'Automatically triggers the background processor when a search job is created or updated to pending status';
