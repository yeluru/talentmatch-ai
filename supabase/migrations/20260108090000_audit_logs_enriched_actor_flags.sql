-- Add actor role flags to audit_logs_enriched for better filtering in UIs
-- (e.g. org admins should not see platform-admin actions by default)

CREATE OR REPLACE VIEW public.audit_logs_enriched AS
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


