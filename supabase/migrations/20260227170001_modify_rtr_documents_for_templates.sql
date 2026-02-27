-- Modify rtr_documents table to support multiple templates

-- Add template reference
ALTER TABLE public.rtr_documents
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.rtr_templates(id) ON DELETE SET NULL;

-- Add email recipient tracking
ALTER TABLE public.rtr_documents
ADD COLUMN IF NOT EXISTS to_email TEXT; -- May differ from candidate email if edited

ALTER TABLE public.rtr_documents
ADD COLUMN IF NOT EXISTS cc_emails TEXT[]; -- CC'd emails from editable CC field

ALTER TABLE public.rtr_documents
ADD COLUMN IF NOT EXISTS bcc_emails TEXT[]; -- BCC'd emails (recruiter + account manager)

-- Add template name for historical tracking (denormalized)
ALTER TABLE public.rtr_documents
ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Create index for template lookups
CREATE INDEX IF NOT EXISTS idx_rtr_documents_template ON public.rtr_documents(template_id);

-- Comments
COMMENT ON COLUMN public.rtr_documents.template_id IS 'Reference to the RTR template used. NULL for legacy records created before multi-template system.';
COMMENT ON COLUMN public.rtr_documents.to_email IS 'To email address (editable by recruiter, defaults to candidate email)';
COMMENT ON COLUMN public.rtr_documents.cc_emails IS 'CC email addresses from editable CC field';
COMMENT ON COLUMN public.rtr_documents.bcc_emails IS 'BCC email addresses (recruiter + account manager, auto-added)';
COMMENT ON COLUMN public.rtr_documents.template_name IS 'Template name at time of creation (for historical tracking if template is deleted)';
