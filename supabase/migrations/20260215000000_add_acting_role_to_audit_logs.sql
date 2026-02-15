-- Add acting_role column to audit_logs if it doesn't exist
-- This tracks which role the user was acting as when they performed the action

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'acting_role'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD COLUMN acting_role TEXT;

    COMMENT ON COLUMN public.audit_logs.acting_role IS 'The role the user was acting as when they performed this action (e.g., recruiter, account_manager, org_admin)';

    -- Create index for filtering by acting_role
    CREATE INDEX IF NOT EXISTS idx_audit_logs_acting_role
      ON public.audit_logs(acting_role, created_at DESC);

    RAISE NOTICE 'Added acting_role column to audit_logs';
  ELSE
    RAISE NOTICE 'acting_role column already exists in audit_logs';
  END IF;
END $$;
