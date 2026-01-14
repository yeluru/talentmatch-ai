-- Resume Workspace: store tailoring context on resume_documents

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS base_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS jd_text text;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS additional_instructions text;

ALTER TABLE public.resume_documents
  ADD COLUMN IF NOT EXISTS linkedin_url text;

