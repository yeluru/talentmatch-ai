-- Resume Workspace (Phase 1)
-- New in-app resume documents + versions (separate from uploaded resume files).

-- -----------------------------
-- Tables
-- -----------------------------

CREATE TABLE IF NOT EXISTS public.resume_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Resume',
  template_id text NOT NULL DEFAULT 'ats_single',
  target_role text NULL,
  target_seniority text NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_documents_candidate ON public.resume_documents(candidate_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.resume_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_document_id uuid NOT NULL REFERENCES public.resume_documents(id) ON DELETE CASCADE,
  content_json jsonb NOT NULL,
  change_summary text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_document_versions_doc ON public.resume_document_versions(resume_document_id, created_at DESC);

-- -----------------------------
-- RLS
-- -----------------------------

ALTER TABLE public.resume_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Candidates can manage their resume documents" ON public.resume_documents;
CREATE POLICY "Candidates can manage their resume documents"
ON public.resume_documents
FOR ALL
TO authenticated
USING (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Candidates can manage their resume document versions" ON public.resume_document_versions;
CREATE POLICY "Candidates can manage their resume document versions"
ON public.resume_document_versions
FOR ALL
TO authenticated
USING (
  resume_document_id IN (
    SELECT rd.id
    FROM public.resume_documents rd
    WHERE rd.candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  resume_document_id IN (
    SELECT rd.id
    FROM public.resume_documents rd
    WHERE rd.candidate_id IN (SELECT id FROM public.candidate_profiles WHERE user_id = auth.uid())
  )
);

-- -----------------------------
-- updated_at trigger
-- -----------------------------

DROP TRIGGER IF EXISTS update_resume_documents_updated_at ON public.resume_documents;
CREATE TRIGGER update_resume_documents_updated_at
BEFORE UPDATE ON public.resume_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

