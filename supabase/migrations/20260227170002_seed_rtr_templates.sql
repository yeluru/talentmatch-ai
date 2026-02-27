-- Seed RTR Templates
-- NOTE: Update docuseal_template_id values once templates are created in DocuSeal UI

-- Get the organization ID (assuming single org for now - adjust if multi-org)
DO $$
DECLARE
  org_id UUID;
BEGIN
  -- Get first organization (adjust this query for your setup)
  SELECT id INTO org_id FROM public.organizations LIMIT 1;

  IF org_id IS NULL THEN
    RAISE NOTICE 'No organization found. Skipping RTR template seed.';
    RETURN;
  END IF;

  -- Template 1: Employer (RTR by Vendor)
  INSERT INTO public.rtr_templates (
    organization_id,
    name,
    description,
    docx_filename,
    docuseal_template_id,
    field_config,
    display_order,
    is_active
  ) VALUES (
    org_id,
    'RTR by Vendor',
    'Vendor signs on behalf of candidate. Used when staffing company is primary signer.',
    'Employer_CompSciPrep_RTR_Styled.docx',
    NULL, -- TODO: Replace with actual DocuSeal template ID (e.g., 'tpl_abc123')
    '{
      "fields": [
        {
          "key": "sign_date",
          "label": "Sign date (e.g. 6th day of February 2026)",
          "type": "text",
          "recruiterFillable": true,
          "order": 1,
          "placeholder": "__________________________"
        },
        {
          "key": "vendor_name",
          "label": "Vendor name (company signing)",
          "type": "text",
          "recruiterFillable": true,
          "order": 2,
          "placeholder": "_______________________________"
        },
        {
          "key": "subcontractor",
          "label": "Subcontractor / Prime Vendor (e.g. IBM-VRN)",
          "type": "text",
          "recruiterFillable": true,
          "order": 3,
          "placeholder": "_________________________________"
        },
        {
          "key": "client",
          "label": "Client name (e.g. IBM)",
          "type": "text",
          "recruiterFillable": true,
          "order": 4,
          "placeholder": "_________________________"
        },
        {
          "key": "client_location",
          "label": "Client location (e.g. Bryant Park - NYC)",
          "type": "text",
          "recruiterFillable": true,
          "order": 5,
          "placeholder": "____________________________"
        },
        {
          "key": "rate",
          "label": "Rate (e.g. $90 per hour)",
          "type": "text",
          "recruiterFillable": true,
          "order": 6,
          "placeholder": "$______"
        },
        {
          "key": "duration",
          "label": "Duration (e.g. W2, 1099, 6 months)",
          "type": "text",
          "recruiterFillable": true,
          "order": 7,
          "placeholder": "_________"
        },
        {
          "key": "candidate_name",
          "label": "Candidate name",
          "type": "text",
          "recruiterFillable": false,
          "order": 8,
          "placeholder": "[________________________________]"
        },
        {
          "key": "candidate_address",
          "label": "Candidate address",
          "type": "text",
          "recruiterFillable": false,
          "order": 9,
          "placeholder": "[______________________________]"
        },
        {
          "key": "position_title",
          "label": "Position title",
          "type": "text",
          "recruiterFillable": false,
          "order": 10,
          "placeholder": "[______________________________]"
        }
      ]
    }',
    1,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Template 2: Generic (RTR by Candidate)
  INSERT INTO public.rtr_templates (
    organization_id,
    name,
    description,
    docx_filename,
    docuseal_template_id,
    field_config,
    display_order,
    is_active
  ) VALUES (
    org_id,
    'RTR by Candidate',
    'Candidate signs directly. Standard RTR for most placements.',
    'Generic_CompSciPrep_RTR_Styled.docx',
    NULL, -- TODO: Replace with actual DocuSeal template ID (e.g., 'tpl_def456')
    '{
      "fields": [
        {
          "key": "sign_date",
          "label": "Sign date (e.g. 6th day of February 2026)",
          "type": "text",
          "recruiterFillable": true,
          "order": 1,
          "placeholder": "________________________"
        },
        {
          "key": "candidate_name",
          "label": "Candidate name",
          "type": "text",
          "recruiterFillable": true,
          "order": 2,
          "placeholder": "______________________________"
        },
        {
          "key": "subcontractor",
          "label": "Subcontractor / Prime Vendor (e.g. IBM-VRN)",
          "type": "text",
          "recruiterFillable": true,
          "order": 3,
          "placeholder": "__________________________"
        },
        {
          "key": "client",
          "label": "Client name (e.g. IBM)",
          "type": "text",
          "recruiterFillable": true,
          "order": 4,
          "placeholder": "____________________"
        },
        {
          "key": "client_location",
          "label": "Client location (e.g. Bryant Park - NYC)",
          "type": "text",
          "recruiterFillable": true,
          "order": 5,
          "placeholder": "_______________________"
        },
        {
          "key": "rate",
          "label": "Rate (e.g. $90 per hour)",
          "type": "text",
          "recruiterFillable": true,
          "order": 6,
          "placeholder": "$__________"
        },
        {
          "key": "duration",
          "label": "Duration (e.g. W2, 1099, 6 months)",
          "type": "text",
          "recruiterFillable": true,
          "order": 7,
          "placeholder": "_________"
        },
        {
          "key": "candidate_address",
          "label": "Candidate address",
          "type": "text",
          "recruiterFillable": false,
          "order": 8,
          "placeholder": "[_______________________]"
        },
        {
          "key": "position_title",
          "label": "Position title",
          "type": "text",
          "recruiterFillable": false,
          "order": 9,
          "placeholder": "[_______________________________________]"
        }
      ]
    }',
    2,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Template 3: IBM (RTR for IBM roles)
  INSERT INTO public.rtr_templates (
    organization_id,
    name,
    description,
    docx_filename,
    docuseal_template_id,
    field_config,
    display_order,
    is_active
  ) VALUES (
    org_id,
    'RTR for IBM roles',
    'Specialized template for IBM/APOLLO GLOBAL roles. Client and location are fixed.',
    'IBM_CompSciPrep_RTR_Styled.docx',
    NULL, -- TODO: Replace with actual DocuSeal template ID (e.g., 'tpl_ghi789')
    '{
      "fields": [
        {
          "key": "sign_date",
          "label": "Sign date (e.g. 6th day of February 2026)",
          "type": "text",
          "recruiterFillable": true,
          "order": 1,
          "placeholder": "_________________________________"
        },
        {
          "key": "candidate_name",
          "label": "Candidate name",
          "type": "text",
          "recruiterFillable": true,
          "order": 2,
          "placeholder": "_________________________________"
        },
        {
          "key": "rate",
          "label": "Rate (e.g. $90 per hour)",
          "type": "text",
          "recruiterFillable": true,
          "order": 3,
          "placeholder": "$_________"
        },
        {
          "key": "duration",
          "label": "Contract type (e.g. W2, 1099, Corp-to-Corp)",
          "type": "text",
          "recruiterFillable": true,
          "order": 4,
          "placeholder": "______"
        },
        {
          "key": "candidate_address",
          "label": "Candidate address",
          "type": "text",
          "recruiterFillable": false,
          "order": 5,
          "placeholder": "_________________________________"
        },
        {
          "key": "position_title",
          "label": "Position title",
          "type": "text",
          "recruiterFillable": false,
          "order": 6,
          "placeholder": "[Middle Office Credit Technology]"
        }
      ],
      "hardcodedFields": {
        "subcontractor": "IBM-VRN",
        "client_partner": "APOLLO GLOBAL",
        "client_location": "Bryant Park – New York City",
        "schedule": "40-hour/week schedule"
      }
    }',
    3,
    true
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'RTR templates seeded for organization: %', org_id;
  RAISE NOTICE 'TODO: Update docuseal_template_id values once templates are created in DocuSeal UI';
END $$;
