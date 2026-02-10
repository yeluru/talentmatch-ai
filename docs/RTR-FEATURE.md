# RTR (Right to Represent) Feature

## Overview

The **Right to Represent (RTR)** feature allows recruiters to send customized candidate agreements via email with dynamically merged DOCX documents. The system takes a template DOCX file, fills in recruiter-provided information, and sends it to candidates for completion and signature.

## Architecture

### Components

1. **Frontend Form** (`src/pages/recruiter/CandidatePipeline.tsx`)
   - Modal popup triggered when moving candidate to "RTR" stage
   - Form fields defined in `src/lib/rtrFields.ts`
   - Uses `invokeFunction` utility to call edge function

2. **Edge Function** (`supabase/functions/send-rtr-email/index.ts`)
   - Receives form data and candidate email
   - Performs DOCX template merge
   - Sends email via SMTP (Resend or configured provider)

3. **DOCX Processing**
   - Template: `docs/CompSciPrep_RTR_Template.docx`
   - Bundled as base64: `supabase/functions/send-rtr-email/docx_template_b64.ts`
   - Zip pass-through utilities: `supabase/functions/send-rtr-email/docxZipPassThrough.ts`

## Field Configuration

### Recruiter-Fillable Fields (7 fields)

The RTR form collects these fields from the recruiter:

1. **sign_date** - Date of agreement (e.g., "28th day of January 2026")
2. **candidate_name** - Full name of candidate
3. **subcontractor** - Subcontractor company name
4. **client** - End client company name
5. **client_partner** - Partner client name (combined with client if both provided)
6. **client_location** - Work location
7. **rate** - Compensation rate (e.g., "$90 per hour")
8. **position_title** - Job position title

**Note:** Field #3 (`candidate_address`) is intentionally skipped during merge - the candidate fills this manually after receiving the document.

### Candidate-Fillable Fields (5 fields)

These fields remain blank in the generated document for the candidate to complete:

1. **candidate_address** - Mailing address
2. **candidate_signature** - Electronic or physical signature
3. **printed_name** - Name in printed form
4. **ssn_last_four** - Last 4 digits of SSN
5. **date** - Date of signature

## Template Structure

The DOCX template (`docs/CompSciPrep_RTR_Template.docx`) uses two types of placeholders:

### 1. Underscore Placeholders (23 underscores)

Format: `[_______________________]` (exactly 23 underscores)

These placeholders are replaced sequentially by the ordered field values. The system finds all instances and replaces them in order, skipping the 3rd occurrence (candidate address).

### 2. Text Bracket Placeholders

Format: `[text with letters]`

The position title uses this format. Unlike underscore placeholders, text brackets contain descriptive text. The system replaces the FIRST occurrence of a bracket pattern containing letters with the position title.

**Critical ordering:** Position title replacement happens BEFORE underscore replacement to prevent matching newly-inserted values like `[Jane Doe]`.

## Merge Process

### Step-by-Step Flow

1. **Receive Request**
   - Edge function receives `rtrFields` object and `toEmail`

2. **Load Template**
   - Base64-encoded template is decoded to bytes
   - Template is unzipped to access `word/document.xml`

3. **XML Normalization**
   - Microsoft Word often splits bracket sequences across multiple XML runs
   - Example: `[` in one run, `___...` in another, `]` in a third
   - Normalization collapses these split runs into single `<w:r>` elements
   - Preserves original underscore count (doesn't hardcode to 23)

4. **Position Title Replacement**
   - Finds first `[text-with-letters]` pattern
   - Replaces with `[<position_title>]`
   - Must happen before underscore replacement

5. **Sequential Underscore Replacement**
   - Builds ordered array of 7 values (with index 2 = null for skipping)
   - Finds all `[_______________________]` placeholders
   - Replaces each with corresponding value from array
   - Skips null entries, leaving those placeholders intact

6. **Client Name Combining**
   - If both `client` and `client_partner` provided: `"<client>'s partner client, <partner>"`
   - Otherwise: whichever is provided

7. **Apply Bold Formatting**
   - All replaced text is made bold
   - Adds `<w:b/>` and `<w:bCs/>` tags to `<w:rPr>` elements
   - Handles both existing `<w:rPr>` and creates new ones

8. **XML Replacement**
   - Modified XML replaces original `word/document.xml` in the zip
   - Other zip entries pass through unchanged

9. **Generate PDF** (Future enhancement)
   - Currently generates DOCX attachment
   - PDF form fields defined for candidate completion

10. **Send Email**
    - Constructs email with merged DOCX attachment
    - Sends via configured SMTP provider (Resend)

## XML Processing Details

### Safe Regex Patterns

The implementation uses **non-backtracking regex patterns** to avoid catastrophic backtracking in large XML documents:

```typescript
// ❌ BAD (can cause catastrophic backtracking)
const pattern = /<w:rPr>[\s\S]*?<\/w:rPr>/;

// ✅ GOOD (safe, bounded matching)
const pattern = /<w:rPr>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>/;
```

The safe pattern matches characters that are NOT `<`, OR matches `<` only if not followed by `/w:rPr>`.

### Text Escaping

All merged text values are XML-escaped to prevent malformed documents:

```typescript
function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

## Configuration

### Frontend Form Fields

Defined in `src/lib/rtrFields.ts`:

```typescript
export const rtrFieldsConfig = [
  { name: "sign_date", label: "Sign Date", type: "text", required: true },
  { name: "candidate_name", label: "Candidate Name", type: "text", required: true },
  { name: "subcontractor", label: "Subcontractor", type: "text", required: true },
  { name: "client", label: "Client", type: "text", required: false },
  { name: "client_partner", label: "Client Partner", type: "text", required: false },
  { name: "client_location", label: "Client Location", type: "text", required: true },
  { name: "rate", label: "Rate", type: "text", required: true },
  { name: "position_title", label: "Position Title", type: "text", required: true },
];
```

### Edge Function Environment

Required environment variables (set via `supabase secrets set` in production):

- `RESEND_API_KEY` - API key for Resend email service
- `RESEND_FROM` - Sender email address
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

## Local Development

### Running Locally

1. **Start Supabase**
   ```bash
   supabase start
   ```

2. **Serve Edge Functions**
   ```bash
   supabase functions serve --env-file supabase/functions.env
   ```

3. **Test RTR Flow**
   - Open app at `http://localhost:8080`
   - Navigate to Recruiter → Pipeline
   - Move a candidate to "RTR" stage
   - Fill in the RTR form
   - Check Mailpit for the email (Supabase status shows Mailpit URL)

### Viewing Local Emails

Supabase local includes **Mailpit** for email testing:

```bash
supabase status
# Look for: Mailpit URL: http://127.0.0.1:54324
```

All emails sent locally are captured in Mailpit instead of being sent to real addresses.

## Production Deployment

### 1. Template Update

If the DOCX template changes:

```bash
cd supabase/functions/send-rtr-email
# Update the template file
cp /path/to/new/template.docx CompSciPrep_RTR_Template.docx

# Regenerate base64 bundle
base64 -i CompSciPrep_RTR_Template.docx | tr -d '\n' > temp_b64.txt
# Manually update docx_template_b64.ts with the base64 string
```

### 2. Deploy Edge Function

```bash
supabase functions deploy send-rtr-email
```

### 3. Set Production Secrets

```bash
supabase secrets set RESEND_API_KEY=your_key_here
supabase secrets set RESEND_FROM=noreply@yourdomain.com
```

### 4. Frontend Deployment

The frontend automatically includes the updated `rtrFields.ts` configuration when built and deployed to Render.

## Troubleshooting

### Common Issues

**❌ Placeholders not replaced**
- Check that template has exactly 23 underscores in `[_______________________]`
- Verify field names match between form and edge function
- Ensure position title replacement happens before underscore replacement

**❌ XML malformed after merge**
- Verify all text values are XML-escaped
- Check for safe regex patterns (no `[\s\S]*?` in XML contexts)
- Ensure normalization preserves original underscore count

**❌ Email not sent**
- Check `RESEND_API_KEY` and `RESEND_FROM` secrets
- Verify SMTP provider (Resend) is configured correctly
- Check edge function logs for errors

**❌ Template not found**
- Verify `docx_template_b64.ts` contains valid base64
- Ensure import path is correct in `index.ts`
- Check that template file wasn't corrupted during encoding

## Future Enhancements

1. **PDF Generation** - Convert merged DOCX to fillable PDF with form fields
2. **Candidate Portal** - Web interface for candidates to complete and sign
3. **Multiple Templates** - Support for different agreement types
4. **Audit Trail** - Track who sent RTR, when, and candidate response
5. **Template Editor** - UI for non-technical users to customize templates

## Related Files

- `docs/CompSciPrep_RTR_Template.docx` - Source template
- `src/lib/rtrFields.ts` - Form field configuration
- `src/lib/invokeFunction.ts` - Edge function invocation utility
- `src/pages/recruiter/CandidatePipeline.tsx` - RTR form modal (lines ~800-900)
- `supabase/functions/send-rtr-email/index.ts` - Main edge function
- `supabase/functions/send-rtr-email/docxZipPassThrough.ts` - DOCX utilities
- `supabase/functions/send-rtr-email/docx_template_b64.ts` - Bundled template
- `.claude/projects/.../memory/MEMORY.md` - Development notes and learnings

## References

- [Microsoft Office Open XML Format](https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-wordprocessingml-document)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Resend Email API](https://resend.com/docs/introduction)
