-- Daily User Activity Tracking System
-- Purpose: Track recruiter/AM productivity metrics for manager dashboards
-- Features: Session tracking, action metrics, AI summaries

-- ============================================================================
-- PART 1: User Sessions Table (for login/logout tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  acting_role TEXT,  -- Role they were acting as (recruiter, account_manager, etc.)

  -- Session timing
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  logout_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  duration_minutes INT,  -- Calculated: (logout_at - login_at) in minutes

  -- Session metadata
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_date
  ON public.user_sessions(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_org
  ON public.user_sessions(organization_id, login_at DESC);

COMMENT ON TABLE public.user_sessions IS 'Track user login/logout sessions for activity monitoring';

-- ============================================================================
-- PART 2: Daily User Activity Summary Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  acting_role TEXT,  -- Role they were acting as during these actions

  -- Session metrics
  login_count INT DEFAULT 0,
  total_active_minutes INT DEFAULT 0,
  first_activity_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,

  -- Candidate metrics
  candidates_imported INT DEFAULT 0,
  candidates_uploaded INT DEFAULT 0,
  candidates_moved INT DEFAULT 0,
  candidates_created INT DEFAULT 0,
  notes_added INT DEFAULT 0,

  -- Pipeline breakdown (status changes)
  moved_to_screening INT DEFAULT 0,
  moved_to_interview INT DEFAULT 0,
  moved_to_offer INT DEFAULT 0,
  moved_to_hired INT DEFAULT 0,
  moved_to_rejected INT DEFAULT 0,

  -- Job metrics
  jobs_created INT DEFAULT 0,
  jobs_worked_on UUID[],  -- Array of job IDs they were active on

  -- Communication metrics
  emails_sent INT DEFAULT 0,
  rtr_documents_sent INT DEFAULT 0,

  -- Application metrics
  applications_created INT DEFAULT 0,
  applications_updated INT DEFAULT 0,

  -- AI summary (generated on-demand)
  ai_summary TEXT,
  summary_generated_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, organization_id, activity_date, acting_role)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date
  ON public.daily_user_activity(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_org_date
  ON public.daily_user_activity(organization_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date
  ON public.daily_user_activity(activity_date DESC);

COMMENT ON TABLE public.daily_user_activity IS 'Aggregated daily activity metrics per user for manager dashboards';

-- ============================================================================
-- PART 3: Function to Aggregate Activity from Audit Logs
-- ============================================================================

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
  -- (This is approximate - would need to parse details JSONB for exact stage)
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

  -- Get jobs worked on (from entity_id where entity_type = 'job' or 'application')
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
  -- This is a rough estimate until we have proper session tracking
  DECLARE
    v_active_minutes INT := 0;
  BEGIN
    IF v_first_activity IS NOT NULL AND v_last_activity IS NOT NULL THEN
      v_active_minutes := EXTRACT(EPOCH FROM (v_last_activity - v_first_activity)) / 60;
      -- Cap at reasonable max (16 hours = 960 minutes)
      v_active_minutes := LEAST(v_active_minutes, 960);
    END IF;
  END;

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

COMMENT ON FUNCTION public.aggregate_user_activity IS 'Aggregate user activity from audit logs into daily summary';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.aggregate_user_activity TO authenticated;

-- ============================================================================
-- PART 4: RLS Policies
-- ============================================================================

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_user_activity ENABLE ROW LEVEL SECURITY;

-- Users can see their own sessions
CREATE POLICY "Users can view own sessions"
  ON public.user_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Managers can view team sessions
CREATE POLICY "Managers can view team sessions"
  ON public.user_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND organization_id = user_sessions.organization_id
        AND role IN ('account_manager', 'org_admin', 'super_admin')
    )
  );

-- Users can view their own activity
CREATE POLICY "Users can view own activity"
  ON public.daily_user_activity FOR SELECT
  USING (auth.uid() = user_id);

-- Managers can view team activity
CREATE POLICY "Managers can view team activity"
  ON public.daily_user_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND organization_id = daily_user_activity.organization_id
        AND role IN ('account_manager', 'org_admin', 'super_admin')
    )
  );

-- Super admin can view all
CREATE POLICY "Super admin can view all activity"
  ON public.daily_user_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
  );
