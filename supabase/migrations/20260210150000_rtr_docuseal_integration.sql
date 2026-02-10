-- RTR DocuSeal Integration
-- Track RTR documents sent via DocuSeal for electronic signatures

CREATE TABLE IF NOT EXISTS public.rtr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,

  -- DocuSeal fields
  docuseal_submission_id text UNIQUE NOT NULL,
  docuseal_template_id text,
  signing_url text NOT NULL,

  -- Document metadata
  document_type text NOT NULL DEFAULT 'rtr',
  rtr_fields jsonb, -- Store the original form data

  -- Status tracking
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'completed', 'declined')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,

  -- Document storage
  signed_document_url text,

  -- Audit fields
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rtr_documents_candidate ON public.rtr_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_org ON public.rtr_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_status ON public.rtr_documents(status);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_docuseal ON public.rtr_documents(docuseal_submission_id);
CREATE INDEX IF NOT EXISTS idx_rtr_documents_created_at ON public.rtr_documents(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_rtr_documents_updated_at
  BEFORE UPDATE ON public.rtr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.rtr_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Recruiters and account managers can view RTR documents for their org
CREATE POLICY "Staff can view org RTR documents"
  ON public.rtr_documents
  FOR SELECT
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'recruiter'::public.app_role)
      OR public.has_role(auth.uid(), 'account_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'org_admin'::public.app_role)
    )
  );

-- Recruiters and account managers can insert RTR documents for their org
CREATE POLICY "Staff can insert RTR documents"
  ON public.rtr_documents
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'recruiter'::public.app_role)
      OR public.has_role(auth.uid(), 'account_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'org_admin'::public.app_role)
    )
  );

-- Service role (webhooks) can update RTR documents
CREATE POLICY "Service can update RTR documents"
  ON public.rtr_documents
  FOR UPDATE
  USING (true);

-- Super admins can view all RTR documents
CREATE POLICY "Super admins can view all RTR documents"
  ON public.rtr_documents
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Grant permissions
GRANT SELECT, INSERT ON public.rtr_documents TO authenticated;
GRANT UPDATE ON public.rtr_documents TO service_role;

-- Comments for documentation
COMMENT ON TABLE public.rtr_documents IS 'Tracks RTR (Right to Represent) documents sent via DocuSeal for electronic signatures';
COMMENT ON COLUMN public.rtr_documents.docuseal_submission_id IS 'DocuSeal submission/envelope ID for tracking';
COMMENT ON COLUMN public.rtr_documents.signing_url IS 'URL for candidate to sign the document';
COMMENT ON COLUMN public.rtr_documents.status IS 'Document status: sent, viewed, completed, or declined';
COMMENT ON COLUMN public.rtr_documents.rtr_fields IS 'JSON object containing the original RTR form data (sign_date, candidate_name, etc.)';
