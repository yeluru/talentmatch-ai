-- =============================================================================
-- PRODUCTION RESET: Delete all data and auth users; keep schema, RLS, functions.
-- =============================================================================
-- Run in Supabase Dashboard → SQL Editor (Project runs as postgres).
-- WARNING: This cannot be undone. All organizations, jobs, applications, users,
-- and auth accounts will be removed. Use only when you want to start completely over.
-- =============================================================================

BEGIN;

-- 1) Truncate all tables in public schema (keeps schema, RLS, functions)
DO $$
DECLARE
  r RECORD;
  tbls text := '';
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    tbls := tbls || 'public.' || quote_ident(r.tablename) || ', ';
  END LOOP;
  tbls := rtrim(tbls, ', ');
  IF tbls != '' THEN
    EXECUTE 'TRUNCATE TABLE ' || tbls || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- 2) Delete all auth users (so you can sign up again from scratch)
-- Order matters: identities and sessions reference users
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.identities;
DELETE FROM auth.users;

COMMIT;

-- =============================================================================
-- AFTER RUNNING:
-- - All app data (orgs, jobs, applications, invites, etc.) is gone.
-- - All auth users are gone. platform_admin_allowlist is also empty.
-- - Schema, RLS, Edge Function secrets, Auth URL config unchanged.
-- Optionally: Storage → Buckets → resumes: delete objects if you want no leftover files.
-- =============================================================================
-- STEP: Re-add your platform admin email so the first sign-in becomes super_admin.
-- Run the following ONCE, replacing with your email (same one you will use to sign up):
-- =============================================================================

-- INSERT INTO public.platform_admin_allowlist (email) VALUES ('your-admin@example.com');
