-- Update RTR for IBM roles template field config for template 2986320
-- Changes:
-- 1. Updated label for duration → "Contract Type (e.g. W2, 1099, Corp-to-Corp)"

UPDATE rtr_templates
SET field_config = '{
  "fields": [
    {"key": "sign_date", "type": "text", "label": "Sign date (e.g. 6th day of February 2026)", "order": 1, "placeholder": "_________________________________", "recruiterFillable": true},
    {"key": "candidate_name", "type": "text", "label": "Candidate name", "order": 2, "placeholder": "_________________________________", "recruiterFillable": true},
    {"key": "rate", "type": "text", "label": "Rate (e.g. $90 per hour)", "order": 3, "placeholder": "$_________", "recruiterFillable": true},
    {"key": "duration", "type": "text", "label": "Contract Type (e.g. W2, 1099, Corp-to-Corp)", "order": 4, "placeholder": "______", "recruiterFillable": true},
    {"key": "candidate_address", "type": "text", "label": "Candidate address", "order": 5, "placeholder": "_________________________________", "recruiterFillable": false},
    {"key": "position_title", "type": "text", "label": "Position title", "order": 6, "placeholder": "[Middle Office Credit Technology]", "recruiterFillable": false}
  ],
  "hardcodedFields": {
    "schedule": "40-hour/week schedule",
    "subcontractor": "IBM-VRN",
    "client_partner": "APOLLO GLOBAL",
    "client_location": "Bryant Park – New York City"
  }
}'
WHERE docuseal_template_id = '2986320';
