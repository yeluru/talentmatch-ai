-- Update RTR by Vendor template field config to match DocuSeal template 2985588
-- Changes:
-- 1. Renamed vendor_name → vendor
-- 2. Renamed duration → contact_type
-- 3. Removed subcontractor field (not in this template)
-- 4. Updated label for contact_type

UPDATE rtr_templates
SET field_config = '{
  "fields": [
    {"key": "sign_date", "type": "text", "label": "Sign date (e.g. 6th day of February 2026)", "order": 1, "placeholder": "__________________________", "recruiterFillable": true},
    {"key": "vendor", "type": "text", "label": "Vendor name (company signing)", "order": 2, "placeholder": "_______________________________", "recruiterFillable": true},
    {"key": "client", "type": "text", "label": "Client name (e.g. IBM)", "order": 3, "placeholder": "_________________________", "recruiterFillable": true},
    {"key": "client_location", "type": "text", "label": "Client location (e.g. Bryant Park - NYC)", "order": 4, "placeholder": "____________________________", "recruiterFillable": true},
    {"key": "rate", "type": "text", "label": "Rate (e.g. $90 per hour)", "order": 5, "placeholder": "$______", "recruiterFillable": true},
    {"key": "contact_type", "type": "text", "label": "Contact type (e.g. W2, 1099, Corp-to-Corp)", "order": 6, "placeholder": "_________", "recruiterFillable": true},
    {"key": "candidate_name", "type": "text", "label": "Candidate name", "order": 7, "placeholder": "[________________________________]", "recruiterFillable": false},
    {"key": "candidate_address", "type": "text", "label": "Candidate address", "order": 8, "placeholder": "[______________________________]", "recruiterFillable": false},
    {"key": "position_title", "type": "text", "label": "Position title", "order": 9, "placeholder": "[______________________________]", "recruiterFillable": false}
  ]
}'
WHERE docuseal_template_id = '2985588';
