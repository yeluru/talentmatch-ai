-- Fix security vulnerability: Change audit_logs_enriched from SECURITY DEFINER to SECURITY INVOKER
-- This ensures the view respects the querying user's RLS policies rather than the view creator's

-- Drop and recreate the view with explicit SECURITY INVOKER
DROP VIEW IF EXISTS public.audit_logs_enriched;

CREATE OR REPLACE VIEW public.audit_logs_enriched
WITH (security_invoker = true) AS
SELECT
  al.id,
  al.organization_id,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.details,
  al.details::text AS details_text,
  al.ip_address,
  al.created_at,
  o.name AS org_name,
  p.full_name AS user_full_name,
  p.email AS user_email,
  COALESCE(
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = al.user_id
        AND ur.role = 'super_admin'
    ),
    false
  ) AS actor_is_super_admin
FROM public.audit_logs al
LEFT JOIN public.organizations o ON o.id = al.organization_id
LEFT JOIN public.profiles p ON p.user_id = al.user_id;

COMMENT ON VIEW public.audit_logs_enriched IS
'Enriched audit log view with org and user details. Uses SECURITY INVOKER to respect RLS policies of the querying user.';
