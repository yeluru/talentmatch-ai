-- Update DocuSeal template IDs with actual IDs from DocuSeal UI
-- These IDs were obtained after uploading the sample PDFs and configuring fields

-- RTR by Vendor (Employer template)
UPDATE rtr_templates
SET docuseal_template_id = '2985588'
WHERE name = 'RTR by Vendor'
  AND docuseal_template_id IS NULL;

-- RTR by Candidate (Generic template)
UPDATE rtr_templates
SET docuseal_template_id = '2986303'
WHERE name = 'RTR by Candidate'
  AND docuseal_template_id IS NULL;

-- RTR for IBM roles
UPDATE rtr_templates
SET docuseal_template_id = '2986320'
WHERE name = 'RTR for IBM roles'
  AND docuseal_template_id IS NULL;

-- Verify all templates have DocuSeal IDs
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM rtr_templates
  WHERE docuseal_template_id IS NULL AND is_active = true;

  IF missing_count > 0 THEN
    RAISE WARNING 'Warning: % active templates still missing docuseal_template_id', missing_count;
  ELSE
    RAISE NOTICE 'Success: All active RTR templates have DocuSeal template IDs configured';
  END IF;
END $$;
