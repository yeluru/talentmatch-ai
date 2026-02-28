-- Update RTR template docx_filename to use production Supabase Storage URLs
-- This migration updates the URLs to point to Supabase Storage instead of local files

-- Get the project reference from the current database URL
-- For production: https://szmuvnnawnfclcusfxbs.supabase.co
-- For local: http://kong:8000 (internal Docker network)

-- Update URLs for production
UPDATE rtr_templates SET docx_filename = 'https://szmuvnnawnfclcusfxbs.supabase.co/storage/v1/object/public/rtr-templates/Employer_CompSciPrep_RTR_Styled.docx'
WHERE name = 'RTR by Vendor';

UPDATE rtr_templates SET docx_filename = 'https://szmuvnnawnfclcusfxbs.supabase.co/storage/v1/object/public/rtr-templates/Generic_CompSciPrep_RTR_Styled.docx'
WHERE name = 'RTR by Candidate';

UPDATE rtr_templates SET docx_filename = 'https://szmuvnnawnfclcusfxbs.supabase.co/storage/v1/object/public/rtr-templates/IBM_CompSciPrep_RTR_Styled.docx'
WHERE name = 'RTR for IBM roles';
