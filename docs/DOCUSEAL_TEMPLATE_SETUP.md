# DocuSeal Template Field Configuration Guide

## Overview
This guide shows you exactly how to configure your 3 DocuSeal templates so that recruiter-filled values appear pre-filled (read-only) and candidate fields remain editable.

## Your Templates

You need to configure these 3 templates in DocuSeal:

| Template Name | DocuSeal Template ID | DocuSeal URL |
|---------------|---------------------|--------------|
| RTR by Vendor (Employer) | 2985588 | https://docuseal.com/templates/2985588/edit |
| RTR by Candidate (Generic) | 2986303 | https://docuseal.com/templates/2986303/edit |
| RTR for IBM roles | 2986320 | https://docuseal.com/templates/2986320/edit |

## Field Names Reference

**IMPORTANT**: Each template has different field configurations. Use the correct fields for each template!

### Template 1: RTR by Vendor (Employer) - ID: 2985588

**Recruiter-Filled Fields (Read-Only for Candidate):**

| Field Name in DocuSeal | Description | Example Value |
|------------------------|-------------|---------------|
| `sign_date` | Date recruiter signed | "6th day of February 2026" |
| `vendor_name` | Vendor/Staffing company name | "CompSciPrep" |
| `subcontractor` | Subcontractor/Prime Vendor | "IBM-VRN" |
| `client` | End client company | "Microsoft" |
| `client_location` | Client work location | "Redmond, WA" |
| `rate` | Billing rate | "$85/hour" |
| `duration` | Contract duration/type | "W2, 6 months" |

**Candidate-Fillable Fields (Editable):**

| Field Name in DocuSeal | Description | Field Type |
|------------------------|-------------|------------|
| `candidate_name` | Candidate's full name | Text |
| `candidate_address` | Candidate's mailing address | Text (multiline) |
| `position_title` | Job title | Text |

---

### Template 2: RTR by Candidate (Generic) - ID: 2986303

**Recruiter-Filled Fields (Read-Only for Candidate):**

| Field Name in DocuSeal | Description | Example Value |
|------------------------|-------------|---------------|
| `sign_date` | Date recruiter signed | "6th day of February 2026" |
| `candidate_name` | Candidate's full name | "John Smith" |
| `subcontractor` | Subcontractor/Prime Vendor | "IBM-VRN" |
| `client` | End client company | "Microsoft" |
| `client_location` | Client work location | "Redmond, WA" |
| `rate` | Billing rate | "$85/hour" |
| `duration` | Contract duration/type | "W2, 6 months" |

**Candidate-Fillable Fields (Editable):**

| Field Name in DocuSeal | Description | Field Type |
|------------------------|-------------|------------|
| `candidate_address` | Candidate's mailing address | Text (multiline) |
| `position_title` | Job title | Text |

---

### Template 3: RTR for IBM roles - ID: 2986320

**Recruiter-Filled Fields (Read-Only for Candidate):**

| Field Name in DocuSeal | Description | Example Value |
|------------------------|-------------|---------------|
| `sign_date` | Date recruiter signed | "6th day of February 2026" |
| `candidate_name` | Candidate's full name | "John Smith" |
| `rate` | Billing rate | "$85/hour" |
| `duration` | Contract type | "W2" or "1099" or "Corp-to-Corp" |

**Candidate-Fillable Fields (Editable):**

| Field Name in DocuSeal | Description | Field Type |
|------------------------|-------------|------------|
| `candidate_address` | Candidate's mailing address | Text (multiline) |
| `position_title` | Job title | Text |

**Note**: This template has hardcoded values that are automatically merged into the PDF before sending to DocuSeal. You do NOT need to create fields for these in DocuSeal:
- `schedule` = "40-hour/week schedule"
- `subcontractor` = "IBM-VRN"
- `client_partner` = "APOLLO GLOBAL"
- `client_location` = "Bryant Park – New York City"

These are already printed in the PDF document that DocuSeal receives.

## Step-by-Step Configuration

### For EACH of your 3 templates:

1. **Open the template in DocuSeal**
   - Go to: https://docuseal.com/templates/TEMPLATE_ID/edit
   - Replace TEMPLATE_ID with: 2985588, 2986303, or 2986320

2. **Verify the Role Name**
   - Check that the role is named exactly: **"First Party"**
   - If not, edit it to match exactly (case-sensitive)

3. **Add Recruiter Fields (Read-Only)**
   - Refer to the **Field Names Reference** section above for the specific fields for THIS template
   - For each recruiter field listed for this template:
     - Add a **Text** field in DocuSeal
     - Set the field name EXACTLY as shown (e.g., `vendor_name`, `sign_date`)
     - Assign to role: **First Party**
     - **Mark as "Read-only" or "Pre-filled"** (so candidate cannot edit)
     - Drag to appropriate position on the PDF

4. **Add Candidate Fields (Editable)**
   - Refer to the **Field Names Reference** section above for the specific fields for THIS template
   - For each candidate field listed:
     - All current templates use: `candidate_address` (Text field, multiline) and `position_title` (Text field)
     - Template 1 (Employer) also needs: `candidate_name` (Text field)
   - Set field name EXACTLY as shown
   - Assign to role: **First Party**
   - Leave these as **editable** (NOT read-only)

5. **Save the Template**

6. **Repeat for next template**

## Verification Checklist

After configuring all 3 templates, verify:

- [ ] Template "RTR by Vendor" (2985588) has 10 fields total:
  - 7 recruiter fields (read-only): sign_date, vendor_name, subcontractor, client, client_location, rate, duration
  - 3 candidate fields (editable): candidate_name, candidate_address, position_title
- [ ] Template "RTR by Candidate" (2986303) has 9 fields total:
  - 7 recruiter fields (read-only): sign_date, candidate_name, subcontractor, client, client_location, rate, duration
  - 2 candidate fields (editable): candidate_address, position_title
- [ ] Template "RTR for IBM roles" (2986320) has 6 fields total:
  - 4 recruiter fields (read-only): sign_date, candidate_name, rate, duration
  - 2 candidate fields (editable): candidate_address, position_title
- [ ] Role name is exactly "First Party" in all templates
- [ ] Field names match EXACTLY (case-sensitive)
- [ ] All recruiter fields are marked read-only
- [ ] All candidate fields are editable

## After Configuration

Once you've configured all templates, let me know and I will:

1. Re-enable the field pre-filling code
2. Test that recruiter values appear as read-only
3. Test that candidate can fill their fields
4. Deploy to production

## Field Name Quick Reference

Copy these exact names when creating fields in DocuSeal:

### Template 1: RTR by Vendor (Employer)
**Recruiter fields (read-only):**
```
sign_date
vendor_name
subcontractor
client
client_location
rate
duration
```

**Candidate fields (editable):**
```
candidate_name
candidate_address
position_title
```

### Template 2: RTR by Candidate (Generic)
**Recruiter fields (read-only):**
```
sign_date
candidate_name
subcontractor
client
client_location
rate
duration
```

**Candidate fields (editable):**
```
candidate_address
position_title
```

### Template 3: RTR for IBM roles
**Recruiter fields (read-only):**
```
sign_date
candidate_name
rate
duration
```

**Candidate fields (editable):**
```
candidate_address
position_title
```

## Common Issues

**If fields don't pre-fill:**
- Check field names are EXACT matches (case-sensitive)
- Verify role name is exactly "First Party"
- Ensure read-only checkbox is enabled for recruiter fields

**If candidate can't edit their fields:**
- Make sure candidate fields are NOT marked read-only
- Verify all fields are assigned to "First Party" role

## Questions?

If you run into any issues during setup, take a screenshot and let me know which step you're stuck on.
