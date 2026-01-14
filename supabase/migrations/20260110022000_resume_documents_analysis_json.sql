-- Resume Workspace: store JD extraction + ATS/risk report alongside the resume document

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb;

