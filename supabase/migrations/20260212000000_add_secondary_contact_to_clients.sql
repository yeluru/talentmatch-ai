-- Add secondary contact fields to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS secondary_contact_name TEXT,
ADD COLUMN IF NOT EXISTS secondary_contact_email TEXT,
ADD COLUMN IF NOT EXISTS secondary_contact_phone TEXT;

-- Add comment
COMMENT ON COLUMN public.clients.secondary_contact_name IS 'Secondary contact person name (optional)';
COMMENT ON COLUMN public.clients.secondary_contact_email IS 'Secondary contact person email (optional)';
COMMENT ON COLUMN public.clients.secondary_contact_phone IS 'Secondary contact person phone (optional)';
