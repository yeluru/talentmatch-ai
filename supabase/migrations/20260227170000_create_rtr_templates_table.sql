-- RTR Templates Table
-- Stores multiple RTR templates with dynamic field configurations

CREATE TABLE IF NOT EXISTS public.rtr_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "RTR by Vendor", "RTR by Candidate", "RTR for IBM roles"
  description TEXT,
  docx_filename TEXT NOT NULL, -- "Employer_CompSciPrep_RTR_Styled.docx"
  docuseal_template_id TEXT, -- DocuSeal template ID (e.g., "tpl_abc123")
  field_config JSONB NOT NULL DEFAULT '{"fields": []}', -- Dynamic field definitions
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_rtr_templates_org ON public.rtr_templates(organization_id);
CREATE INDEX idx_rtr_templates_active ON public.rtr_templates(is_active, display_order);
CREATE INDEX idx_rtr_templates_docuseal ON public.rtr_templates(docuseal_template_id) WHERE docuseal_template_id IS NOT NULL;

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_rtr_templates_updated_at ON public.rtr_templates;
CREATE TRIGGER trg_rtr_templates_updated_at
BEFORE UPDATE ON public.rtr_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.rtr_templates ENABLE ROW LEVEL SECURITY;

-- Org admins can manage templates for their org
DROP POLICY IF EXISTS "Org admins can manage RTR templates" ON public.rtr_templates;
CREATE POLICY "Org admins can manage RTR templates"
ON public.rtr_templates
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND organization_id = get_user_organization(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'org_admin'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);

-- Recruiters and account managers can view templates in their org
DROP POLICY IF EXISTS "Staff can view RTR templates" ON public.rtr_templates;
CREATE POLICY "Staff can view RTR templates"
ON public.rtr_templates
FOR SELECT
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
  AND is_active = true
  AND (
    has_role(auth.uid(), 'recruiter'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'org_admin'::app_role)
  )
);

COMMENT ON TABLE public.rtr_templates IS 'RTR document templates with dynamic field configurations';
COMMENT ON COLUMN public.rtr_templates.field_config IS 'JSONB structure: {"fields": [{"key": "sign_date", "label": "Sign date", "type": "text", "recruiterFillable": true, "order": 1, "placeholder": "___"}]}';
COMMENT ON COLUMN public.rtr_templates.docuseal_template_id IS 'Pre-created DocuSeal template ID (e.g., tpl_abc123). If set, submission will use this template with uploaded filled PDF.';
