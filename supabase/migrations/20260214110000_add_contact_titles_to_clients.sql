-- Add title/designation fields for primary and secondary contacts
-- Purpose: Capture contact roles like "VP", "Client Coordinator", "Hiring Manager", etc.

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS contact_title TEXT,
ADD COLUMN IF NOT EXISTS secondary_contact_title TEXT;

-- Add comments
COMMENT ON COLUMN public.clients.contact_title IS 'Primary contact title/designation (e.g., VP, Director, Hiring Manager)';
COMMENT ON COLUMN public.clients.secondary_contact_title IS 'Secondary contact title/designation (e.g., Coordinator, Recruiter, HR Manager)';
