# RTR Template Field Mapping Analysis

## Overview
This document maps the three RTR templates to understand their field structure and differences.

## Template Comparison

### 1. Employer Template (`Employer_CompSciPrep_RTR_Styled.docx`)
**Purpose**: RTR signed by Vendor (staffing company) on behalf of candidate

**Recruiter-Fillable Fields** (no brackets, filled before PDF generation):
1. Date: `__________________________` → "signed on this [DATE]"
2. Vendor Name: `_______________________________` → "by: [VENDOR NAME]"
3. Prime Vendor: `_________________________________` → "subcontractor to Prime Vendor [NAME]"
4. Client Name: `_________________________` → "to Prime Vendor's partner client [CLIENT]"
5. Location: `____________________________` → "located in [LOCATION]"
6. Rate: `$______` → "for [RATE] per hour"
7. Duration: `_________` → "on [DURATION]"

**Candidate-Fillable Fields** (in brackets `[...]`, left blank for candidate to fill):
8. Candidate Name: `[________________________________]` → "for Candidate [NAME]"
9. Candidate Address: `[______________________________]` → "residing at [ADDRESS]"
10. Position Title: `[______________________________]` → "for the position of [TITLE]"

**Key Characteristic**: Vendor signs on behalf of candidate. Used when staffing company is primary signer.

---

### 2. Generic Template (`Generic_CompSciPrep_RTR_Styled.docx`)
**Purpose**: RTR signed directly by Candidate

**Recruiter-Fillable Fields**:
1. Date: `________________________` → "signed on this [DATE]"
2. Candidate Name: `______________________________` → "by: [CANDIDATE NAME]"
3. Prime Vendor: `__________________________` → "subcontractor to Prime Vendor [NAME]"
4. Client Name: `____________________` → "to Prime Vendor's partner client [CLIENT]"
5. Location: `_______________________` → "located in [LOCATION]"
6. Rate: `$__________` → "for [RATE] per hour"
7. Duration: `_________` → "on [DURATION]"

**Candidate-Fillable Fields**:
8. Candidate Address: `[_______________________]` → "residing at [ADDRESS]"
9. Position Title: `[_______________________________________]` → "for the position of [TITLE]"

**Key Characteristic**: Candidate signs directly. Standard RTR for most placements.

---

### 3. IBM Template (`IBM_CompSciPrep_RTR_Styled.docx`)
**Purpose**: RTR specifically for IBM roles via IBM-VRN

**Recruiter-Fillable Fields**:
1. Date: `_________________________________` → "executed on the [DATE]"
2. Candidate Name: `_________________________________` → "Candidate: [NAME]"
3. Rate: `$_________` → "at [RATE]/hour"
4. Duration/Contract Type: `______` → "on [DURATION] (all-inclusive)"

**Candidate-Fillable Fields**:
5. Candidate Address: `_________________________________` → "residing at [ADDRESS]"
6. Position Title: `[Middle Office Credit Technology]` → "for the position of [TITLE]"

**Hardcoded Fields** (cannot be changed):
- Prime Vendor: "IBM-VRN"
- Client: "IBM's partner client, APOLLO GLOBAL"
- Location: "Bryant Park – New York City"
- Schedule: "40-hour/week schedule"

**Key Characteristic**: Specialized template for IBM roles. Client and location are fixed (APOLLO GLOBAL in Bryant Park), but rate and contract type are now dynamic. **Updated: 2026-02-27** - Rate and contract type changed from hardcoded to fillable.

---

## Field Mapping to Database

### Proposed Database Field Names

| UI Label | DB Field Name | Employer | Generic | IBM | Current System |
|----------|--------------|----------|---------|-----|----------------|
| Sign date | `sign_date` | ✓ | ✓ | ✓ | ✓ |
| Candidate name | `candidate_name` | Fillable* | ✓ | ✓ | ✓ |
| Vendor name | `vendor_name` | ✓ | — | — | — |
| Candidate address | `candidate_address` | Fillable | Fillable | Fillable | Fillable |
| Subcontractor / Prime Vendor | `subcontractor` | ✓ | ✓ | (Hardcoded) | ✓ |
| Client name | `client` | ✓ | ✓ | (Hardcoded) | ✓ |
| Client partner | `client_partner` | ✓ | ✓ | (Hardcoded) | ✓ |
| Client location | `client_location` | ✓ | ✓ | (Hardcoded) | ✓ |
| Rate | `rate` | ✓ | ✓ | (Hardcoded) | ✓ |
| Duration | `duration` | ✓ | ✓ | (Hardcoded) | — |
| Position title | `position_title` | Fillable | Fillable | Fillable | ✓ |

*Fillable = Candidate fills this field (left blank in DOCX, added as PDF form field)

### Field Differences Summary

**Employer vs Generic**:
- Employer has "Vendor Name" field (recruiter-fillable)
- Employer has "Candidate Name" as fillable (candidate provides)
- Generic has "Candidate Name" as recruiter-fillable (recruiter provides upfront)

**IBM Template** (Updated 2026-02-27):
- 6 dynamic fields (date, candidate name, rate, duration, candidate address, position)
- 4 fields are hardcoded in the template document itself (subcontractor, client, location, schedule)
- Moderately restrictive - specific to IBM/APOLLO GLOBAL but allows rate/duration flexibility

---

## Recommended Field Config Structure

### Template 1: Employer (RTR by Vendor)

```json
{
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
      "placeholder": "[________________________________]",
      "pdfFormName": "candidate_name",
      "pdfCoords": { "pageIndex": 0, "x": 200, "y": 700, "width": 200, "height": 20 }
    },
    {
      "key": "candidate_address",
      "label": "Candidate address",
      "type": "text",
      "recruiterFillable": false,
      "order": 9,
      "placeholder": "[______________________________]",
      "pdfFormName": "candidate_address",
      "pdfCoords": { "pageIndex": 0, "x": 72, "y": 600, "width": 300, "height": 20 }
    },
    {
      "key": "position_title",
      "label": "Position title",
      "type": "text",
      "recruiterFillable": false,
      "order": 10,
      "placeholder": "[______________________________]",
      "pdfFormName": "position_title",
      "pdfCoords": { "pageIndex": 0, "x": 150, "y": 500, "width": 300, "height": 20 }
    }
  ]
}
```

### Template 2: Generic (RTR by Candidate)

```json
{
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
      "placeholder": "[_______________________]",
      "pdfFormName": "candidate_address",
      "pdfCoords": { "pageIndex": 0, "x": 72, "y": 600, "width": 300, "height": 20 }
    },
    {
      "key": "position_title",
      "label": "Position title",
      "type": "text",
      "recruiterFillable": false,
      "order": 9,
      "placeholder": "[_______________________________________]",
      "pdfFormName": "position_title",
      "pdfCoords": { "pageIndex": 0, "x": 150, "y": 500, "width": 300, "height": 20 }
    }
  ]
}
```

### Template 3: IBM (RTR for IBM roles) - Updated 2026-02-27

```json
{
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
      "placeholder": "_________________________________",
      "pdfFormName": "candidate_address",
      "pdfCoords": { "pageIndex": 0, "x": 72, "y": 650, "width": 300, "height": 20 }
    },
    {
      "key": "position_title",
      "label": "Position title",
      "type": "text",
      "recruiterFillable": false,
      "order": 6,
      "placeholder": "[Middle Office Credit Technology]",
      "pdfFormName": "position_title",
      "pdfCoords": { "pageIndex": 0, "x": 150, "y": 550, "width": 300, "height": 20 }
    }
  ],
  "hardcodedFields": {
    "subcontractor": "IBM-VRN",
    "client_partner": "APOLLO GLOBAL",
    "client_location": "Bryant Park – New York City",
    "schedule": "40-hour/week schedule"
  }
}
```

---

## Key Insights

### 1. Variable Field Count
- **Employer**: 10 total fields (7 recruiter-fillable, 3 candidate-fillable)
- **Generic**: 9 total fields (7 recruiter-fillable, 2 candidate-fillable)
- **IBM**: 6 total fields (4 recruiter-fillable, 2 candidate-fillable) + 4 hardcoded *(Updated 2026-02-27)*

### 2. Unique Fields
- **"vendor_name"**: Only in Employer template (Vendor signs, not candidate)
- **"duration"**: In Employer and Generic, hardcoded in IBM
- **Hardcoded values**: Only IBM template has hardcoded fields

### 3. Candidate-Fillable Pattern
- All templates leave candidate address as fillable (makes sense - candidate provides)
- Position title is fillable in all templates (candidate confirms role)
- Candidate name is fillable in Employer template (vendor represents candidate)

### 4. Placeholder Length Variations
- Underscore counts vary wildly (4 to 39 underscores)
- Some are bracketed `[___]`, some are not
- Bracketed = candidate-fillable, unbracketed = recruiter-fillable
- Length doesn't correlate to importance, just visual spacing in Word

---

## Implementation Implications

### 1. Dynamic Form Rendering
The UI must:
- Fetch template-specific field config from database
- Render only recruiter-fillable fields in the popup
- Show/hide fields based on template selection
- Handle varying field counts (4-10 fields)

### 2. DOCX Merge Logic
The edge function must:
- Load correct template file based on selection
- Match placeholders by order (not by underscore count)
- Handle both bracketed and non-bracketed placeholders
- Leave bracketed placeholders blank for PDF form fields

### 3. DocuSeal Setup
Each template needs:
- Separate DocuSeal template ID
- Different field positions (pdfCoords) per template
- Candidate-fillable fields only (recruiter fields already merged into PDF)

### 4. Database Storage
The `rtr_templates` table must store:
- Template name and file path
- DocuSeal template ID
- Complete field_config JSONB with order, placeholders, PDF coords
- Optional hardcodedFields for templates like IBM

---

## Questions for User

1. **IBM Template Hardcoded Fields**: Should we allow overriding hardcoded fields (client, rate, location) in the UI, or keep them strictly fixed?

2. **Candidate Name Handling**: In Employer template, candidate name is fillable (candidate provides). Should we still pre-fill it in the email or leave truly blank?

3. **Field Validation**: Should certain fields be required (e.g., date, candidate name, rate) before sending RTR?

4. **Template Display Order**: What order should templates appear in the dropdown? (Employer → Generic → IBM, or alphabetical, or custom order per org?)

5. **Future Templates**: Will future templates follow one of these three patterns, or might they have completely different field structures?

6. **PDF Coordinates**: Should we auto-calculate PDF coordinates, or require manual configuration per template via admin UI?
