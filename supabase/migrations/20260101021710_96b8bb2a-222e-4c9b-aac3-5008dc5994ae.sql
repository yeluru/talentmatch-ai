-- Add super_admin to the app_role enum
-- This must be committed before being used in functions/policies
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';