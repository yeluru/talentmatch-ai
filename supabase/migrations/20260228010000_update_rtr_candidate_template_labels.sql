-- Update RTR by Candidate template field config for template 2986303
-- Changes:
-- 1. Updated label for subcontractor → "Prime Vendor (e.g. IBM-VRN)"
-- 2. Updated label for duration → "Contract Type (e.g. W2, 1099, 6 months)"

UPDATE rtr_templates
SET field_config = '{
  "fields": [
    {"key": "sign_date", "type": "text", "label": "Sign date (e.g. 6th day of February 2026)", "order": 1, "placeholder": "________________________", "recruiterFillable": true},
    {"key": "candidate_name", "type": "text", "label": "Candidate name", "order": 2, "placeholder": "______________________________", "recruiterFillable": true},
    {"key": "subcontractor", "type": "text", "label": "Prime Vendor (e.g. IBM-VRN)", "order": 3, "placeholder": "__________________________", "recruiterFillable": true},
    {"key": "client", "type": "text", "label": "Client name (e.g. IBM)", "order": 4, "placeholder": "____________________", "recruiterFillable": true},
    {"key": "client_location", "type": "text", "label": "Client location (e.g. Bryant Park - NYC)", "order": 5, "placeholder": "_______________________", "recruiterFillable": true},
    {"key": "rate", "type": "text", "label": "Rate (e.g. $90 per hour)", "order": 6, "placeholder": "$__________", "recruiterFillable": true},
    {"key": "duration", "type": "text", "label": "Contract Type (e.g. W2, 1099, 6 months)", "order": 7, "placeholder": "_________", "recruiterFillable": true},
    {"key": "candidate_address", "type": "text", "label": "Candidate address", "order": 8, "placeholder": "[_______________________]", "recruiterFillable": false},
    {"key": "position_title", "type": "text", "label": "Position title", "order": 9, "placeholder": "[_______________________________________]", "recruiterFillable": false}
  ]
}'
WHERE docuseal_template_id = '2986303';
