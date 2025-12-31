-- Create clients table for managing client companies
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Users can view org clients" 
ON public.clients 
FOR SELECT 
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can create org clients" 
ON public.clients 
FOR INSERT 
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager')));

CREATE POLICY "Users can update org clients" 
ON public.clients 
FOR UPDATE 
USING (organization_id = get_user_organization(auth.uid()) AND (has_role(auth.uid(), 'recruiter') OR has_role(auth.uid(), 'account_manager')));

CREATE POLICY "Managers can delete org clients" 
ON public.clients 
FOR DELETE 
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'account_manager'));

-- Add client_id to jobs table
ALTER TABLE public.jobs ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Add rejection_reason to applications table for candidate feedback
ALTER TABLE public.applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE public.applications ADD COLUMN rejection_feedback TEXT;

-- Add trigger for updated_at on clients
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_clients_organization ON public.clients(organization_id);
CREATE INDEX idx_jobs_client ON public.jobs(client_id);
CREATE INDEX idx_audit_logs_org_time ON public.audit_logs(organization_id, created_at DESC);