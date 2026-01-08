-- Audit log performance + search support for Platform Admin

-- Fast global ordering (platform admin use-case)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
ON public.audit_logs (created_at DESC);

-- Enriched view for search/display (joins org + user identity)
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
  p.email AS user_email
FROM public.audit_logs al
LEFT JOIN public.organizations o ON o.id = al.organization_id
LEFT JOIN public.profiles p ON p.user_id = al.user_id;


