-- Leads table for web-sourced discovery (store URLs/snippets first; enrich later; then convert to candidates).

CREATE TABLE IF NOT EXISTS public.sourced_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source text NOT NULL DEFAULT 'google_xray',
  search_query text,

  linkedin_url text NOT NULL,
  source_url text,
  title text,
  snippet text,

  match_score integer,
  matched_terms text[],

  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'enrichment_pending', 'enriched', 'failed', 'archived')),
  enrichment_error text,
  enriched_at timestamptz,

  candidate_id uuid REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,

  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure org cannot store same LinkedIn profile multiple times
CREATE UNIQUE INDEX IF NOT EXISTS sourced_leads_org_linkedin_url_uniq
  ON public.sourced_leads(organization_id, linkedin_url);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sourced_leads_set_updated_at ON public.sourced_leads;
CREATE TRIGGER trg_sourced_leads_set_updated_at
BEFORE UPDATE ON public.sourced_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.sourced_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org leads" ON public.sourced_leads
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org leads" ON public.sourced_leads
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update org leads" ON public.sourced_leads
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org leads" ON public.sourced_leads
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

