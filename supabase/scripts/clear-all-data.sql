-- Clear all application data and auth users; keep schema, RLS, and settings.
-- Run this in Supabase Dashboard → SQL Editor (as postgres).
-- After running: re-add your super-admin email to platform_admin_allowlist if you use it.

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

-- After this:
-- - All app data (orgs, jobs, applications, invites, etc.) is gone.
-- - All auth users are gone. You can sign up again as candidate, and create super admin via allowlist.
-- - Schema, RLS, Edge Function secrets, Auth URL config, and RESEND_FROM are unchanged.
-- - Re-add your super-admin email in Table Editor → platform_admin_allowlist if needed.
