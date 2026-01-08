-- Add org_admin to the app_role enum (tenant-level org admin)
-- This MUST be in its own migration/transaction before any policies/functions reference it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'org_admin';



