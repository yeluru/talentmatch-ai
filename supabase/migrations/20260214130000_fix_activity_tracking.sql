-- Hotfix for daily user activity tracking
-- Fix 1: Add named foreign key constraint for PostgREST relationship
-- Fix 2: Fix SQL syntax error in aggregate_user_activity function

-- ============================================================================
-- PART 1: Add named foreign key constraint
-- ============================================================================

-- Drop existing unnamed constraint if it exists
DO $$
BEGIN
  -- Check if the constraint exists with a different name and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'daily_user_activity'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name != 'daily_user_activity_user_id_fkey'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.daily_user_activity DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'daily_user_activity'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name != 'daily_user_activity_user_id_fkey'
      AND constraint_name LIKE '%user_id%'
      LIMIT 1
    );
  END IF;
END $$;

-- Add named foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'daily_user_activity'
    AND constraint_name = 'daily_user_activity_user_id_fkey'
  ) THEN
    ALTER TABLE public.daily_user_activity
    ADD CONSTRAINT daily_user_activity_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Fix aggregate_user_activity function
-- ============================================================================

DROP FUNCTION IF EXISTS public.aggregate_user_activity(UUID, UUID, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.aggregate_user_activity(
  p_user_id UUID,
  p_organization_id UUID,
  p_date DATE DEFAULT CURRENT_DATE,
  p_acting_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_candidates_imported INT := 0;
  v_candidates_uploaded INT := 0;
  v_candidates_moved INT := 0;
  v_notes_added INT := 0;
  v_moved_to_screening INT := 0;
  v_moved_to_interview INT := 0;
  v_moved_to_offer INT := 0;
  v_moved_to_hired INT := 0;
  v_moved_to_rejected INT := 0;
  v_jobs_created INT := 0;
  v_emails_sent INT := 0;
  v_rtr_sent INT := 0;
  v_applications_created INT := 0;
  v_applications_updated INT := 0;
  v_jobs_worked_on UUID[];
  v_first_activity TIMESTAMP WITH TIME ZONE;
  v_last_activity TIMESTAMP WITH TIME ZONE;
  v_active_minutes INT := 0;  -- FIXED: Moved to top-level DECLARE
BEGIN
  -- Get candidates imported (bulk imports)
  SELECT COUNT(*) INTO v_candidates_imported
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action IN ('bulk_import_candidates', 'import_candidate');

  -- Get candidates uploaded (resume uploads)
  SELECT COUNT(*) INTO v_candidates_uploaded
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action IN ('upload_resume', 'create_candidate');

  -- Get pipeline movements (status changes)
  SELECT COUNT(*) INTO v_candidates_moved
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action IN ('update_application_status', 'move_candidate');

  -- Get notes added
  SELECT COUNT(*) INTO v_notes_added
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action = 'update_candidate_notes';

  -- Get pipeline breakdown by stage
  SELECT
    COUNT(*) FILTER (WHERE details->>'new_status' ILIKE '%screening%') AS screening,
    COUNT(*) FILTER (WHERE details->>'new_status' ILIKE '%interview%') AS interview,
    COUNT(*) FILTER (WHERE details->>'new_status' ILIKE '%offer%') AS offer,
    COUNT(*) FILTER (WHERE details->>'new_status' ILIKE '%hired%') AS hired,
    COUNT(*) FILTER (WHERE details->>'new_status' ILIKE '%reject%') AS rejected
  INTO v_moved_to_screening, v_moved_to_interview, v_moved_to_offer, v_moved_to_hired, v_moved_to_rejected
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action = 'update_application_status';

  -- Get jobs created
  SELECT COUNT(*) INTO v_jobs_created
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action = 'create_job';

  -- Get RTR documents sent
  SELECT COUNT(*) INTO v_rtr_sent
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action ILIKE '%rtr%';

  -- Get applications created/updated
  SELECT
    COUNT(*) FILTER (WHERE action = 'create_application') AS created,
    COUNT(*) FILTER (WHERE action = 'update_application') AS updated
  INTO v_applications_created, v_applications_updated
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND action IN ('create_application', 'update_application');

  -- Get jobs worked on
  SELECT ARRAY_AGG(DISTINCT (details->>'job_id')::UUID)
  INTO v_jobs_worked_on
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role)
    AND details->>'job_id' IS NOT NULL;

  -- Get first and last activity timestamps
  SELECT MIN(created_at), MAX(created_at)
  INTO v_first_activity, v_last_activity
  FROM audit_logs
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND DATE(created_at) = p_date
    AND (p_acting_role IS NULL OR acting_role = p_acting_role);

  -- Calculate approximate active time (last - first in minutes)
  -- FIXED: Removed nested DECLARE/BEGIN/END block
  IF v_first_activity IS NOT NULL AND v_last_activity IS NOT NULL THEN
    v_active_minutes := EXTRACT(EPOCH FROM (v_last_activity - v_first_activity)) / 60;
    -- Cap at reasonable max (16 hours = 960 minutes)
    v_active_minutes := LEAST(v_active_minutes, 960);
  END IF;

  -- Upsert into daily_user_activity
  INSERT INTO daily_user_activity (
    user_id,
    organization_id,
    activity_date,
    acting_role,
    total_active_minutes,
    first_activity_at,
    last_activity_at,
    candidates_imported,
    candidates_uploaded,
    candidates_moved,
    notes_added,
    moved_to_screening,
    moved_to_interview,
    moved_to_offer,
    moved_to_hired,
    moved_to_rejected,
    jobs_created,
    jobs_worked_on,
    rtr_documents_sent,
    applications_created,
    applications_updated,
    updated_at
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_date,
    p_acting_role,
    v_active_minutes,
    v_first_activity,
    v_last_activity,
    v_candidates_imported,
    v_candidates_uploaded,
    v_candidates_moved,
    v_notes_added,
    v_moved_to_screening,
    v_moved_to_interview,
    v_moved_to_offer,
    v_moved_to_hired,
    v_moved_to_rejected,
    v_jobs_created,
    v_jobs_worked_on,
    v_rtr_sent,
    v_applications_created,
    v_applications_updated,
    NOW()
  )
  ON CONFLICT (user_id, organization_id, activity_date, acting_role)
  DO UPDATE SET
    total_active_minutes = EXCLUDED.total_active_minutes,
    first_activity_at = EXCLUDED.first_activity_at,
    last_activity_at = EXCLUDED.last_activity_at,
    candidates_imported = EXCLUDED.candidates_imported,
    candidates_uploaded = EXCLUDED.candidates_uploaded,
    candidates_moved = EXCLUDED.candidates_moved,
    notes_added = EXCLUDED.notes_added,
    moved_to_screening = EXCLUDED.moved_to_screening,
    moved_to_interview = EXCLUDED.moved_to_interview,
    moved_to_offer = EXCLUDED.moved_to_offer,
    moved_to_hired = EXCLUDED.moved_to_hired,
    moved_to_rejected = EXCLUDED.moved_to_rejected,
    jobs_created = EXCLUDED.jobs_created,
    jobs_worked_on = EXCLUDED.jobs_worked_on,
    rtr_documents_sent = EXCLUDED.rtr_documents_sent,
    applications_created = EXCLUDED.applications_created,
    applications_updated = EXCLUDED.applications_updated,
    updated_at = NOW();

  -- Return summary
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'date', p_date,
    'acting_role', p_acting_role,
    'metrics', jsonb_build_object(
      'candidates_imported', v_candidates_imported,
      'candidates_uploaded', v_candidates_uploaded,
      'candidates_moved', v_candidates_moved,
      'notes_added', v_notes_added,
      'jobs_created', v_jobs_created,
      'rtr_sent', v_rtr_sent,
      'active_minutes', v_active_minutes
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.aggregate_user_activity IS 'Aggregate user activity from audit logs into daily summary (FIXED: SQL syntax errors)';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.aggregate_user_activity TO authenticated;
