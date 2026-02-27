# RTR Multi-Template System - Analysis & Estimation

## Executive Summary

**Current State**: Single hardcoded RTR template with fixed field structure
**New Requirement**: Multiple client-specific templates with dynamic fields and template selection

**Estimated Effort**: 3-4 days (24-32 hours)
**Complexity**: Medium-High (requires schema changes, edge function refactor, UI updates, DocuSeal configuration)

**📄 Related Documents**:
- [RTR Template Field Mapping](./RTR_TEMPLATE_FIELD_MAPPING.md) - Detailed analysis of all 3 templates with actual field structures

**✅ User Decisions (2026-02-27)**:
1. IBM template hardcoded fields: Keep hardcoded (user updated some to be dynamic - rate and duration now fillable)
2. Candidate name: Pre-fill in email subject/body even when fillable in PDF
3. Account Manager: Lookup via `account_manager_recruiter_assignments` table (AM → Recruiter relationship)
4. Template storage: Use same approach as current (bundled base64 + docs/ folder)
5. Template management UI: Not needed - manual SQL insertion acceptable
6. PDF coordinates: Use DocuSeal auto-detect
7. Existing records: Leave as-is (no backfill)

---

## Current Implementation Analysis

### 1. **Template System** (Single Template)
- **Location**: `docs/CompSciPrep_RTR_Template.docx`
- **Bundled**: Also in `supabase/functions/send-rtr-email/docx_template_b64.ts`
- **Loading**: `loadRtrDocxTemplate()` tries multiple sources (env var, bundled, file paths)
- **Format**: DOCX with:
  - 7 x `[_______________________]` (23-underscore placeholders) for recruiter fields
  - 1 x `[Position Title]` (text-in-brackets) for position
  - Candidate fields left blank (added as PDF form fields later)

### 2. **Field Configuration** (Fixed Schema)
- **File**: `src/lib/rtrFields.ts`
- **Structure**: `RTR_FIELDS` array with 9 fields
  - 7 recruiter-fillable (sign_date, candidate_name, subcontractor, client, client_partner, client_location, rate, position_title)
  - 2 candidate-fillable (candidate_address, candidate_signature, printed_name, ssn_last_four, date)
- **Order**: Must match placeholder order in DOCX template
- **Hardcoded**: No dynamic field discovery

### 3. **Edge Function** (`send-rtr-email/index.ts`)
**Current Flow**:
```
1. Load DOCX template (single template)
2. Merge recruiter values into placeholders
3. Convert DOCX → PDF (CloudConvert/LibreOffice)
4. Add fillable PDF fields for candidate
5. Upload to DocuSeal (if configured)
6. Send email with signing link OR PDF attachment
7. Store record in rtr_documents table
```

**Key Functions**:
- `loadRtrDocxTemplate()` - loads single template
- `mergeDocxWithFields()` - replaces placeholders with recruiter values
- `buildPlaceholderValues()` - maps 7 fixed fields to ordered array
- `convertDocxToPdf()` - uses CloudConvert/LibreOffice
- `addFillableFieldsToPdf()` - adds candidate form fields
- `uploadToDocuSeal()` - creates submission in DocuSeal

### 4. **Frontend** (`CandidatePipeline.tsx`)
- **Trigger**: Drag candidate to "RTR & rate" pipeline stage
- **Popup**: `PipelineModal` with:
  - ScrollArea showing all RTR_RECRUITER_FIELDS
  - Email To/Subject/Body inputs
  - Send button that calls `send-rtr-email` edge function
- **State**: `rtrFieldValues` stores all field values
- **Draft Save**: Auto-saves to sessionStorage

### 5. **DocuSeal Integration** (`docuseal.ts`)
**Current Setup**:
- Requires `DOCUSEAL_API_KEY` env var
- Optional `DOCUSEAL_RTR_TEMPLATE_ID` for reusable template
- Without template ID: Creates one-time template (needs manual field setup in DocuSeal UI)
- With template ID: Uses pre-configured template with fields already set up

**Flow**:
```
1. Edge function generates filled PDF
2. uploadToDocuSeal(pdfBytes, email, name)
3. If no template ID: Creates template via /templates/pdf (one-time, no fields)
4. Creates submission via /submissions
5. Returns submissionId + signingUrl (embed_src)
6. Email contains "Sign RTR Document" button with signing link
```

**Key Issue**: Template creation without fields requires manual setup in DocuSeal UI each time

### 6. **Database** (`rtr_documents` table)
**Schema**:
```sql
- id (uuid)
- organization_id (uuid)
- candidate_id (uuid)
- job_id (uuid, nullable)
- application_id (uuid, nullable)
- docuseal_submission_id (text)
- docuseal_template_id (text)
- signing_url (text)
- rtr_fields (jsonb) -- stores original form data
- status (text) -- sent, viewed, completed, declined
- created_by (uuid)
- created_at, updated_at
```

---

## New Requirements Breakdown

### Requirement 1: Multiple Templates
**Details**:
- 3 initial templates in `docs/RTR Templates/`:
  1. RTR by Vendor
  2. RTR by Candidate
  3. RTR for IBM roles
- Can grow (more templates per client)

**Current**: Single hardcoded template
**Gap**: No template selection mechanism, no template metadata storage

### Requirement 2: Template Selection in UI
**Details**:
- When candidate dragged to RTR stage → popup appears
- First: Dropdown to select template (1 of 3, growing)
- Then: Form fields appear (dynamic based on template)

**Current**: Popup shows fixed fields immediately
**Gap**: No template picker, no dynamic field loading

### Requirement 3: Dynamic Form Fields
**Details**:
- Fields depend on selected template
- Except: "Residing at" and "Signature" always left for candidate
- Everything else should be in the form (recruiter fills)

**Current**: Fixed 7 fields from rtrFields.ts
**Gap**: No field discovery from template, no template-specific field configs

### Requirement 4: Email Recipients
**Details**:
- **To**: Candidate email (editable)
- **CC**: Empty editable text field (recruiter can add additional recipients)
- **BCC**: Recruiter + Account Manager (automatically added, not visible to candidate)

**Current**: Only sends to candidate email (no CC/BCC)
**Gap**: Need to fetch recruiter + account manager emails, add BCC support, make To/CC editable

### Requirement 5: DocuSeal Guidance
**User Question**: "I forgot how to get this populated with DocuSeal"

**Current Issue**: Without `DOCUSEAL_RTR_TEMPLATE_ID`, templates are created without fields
**Required Setup**:
1. For each template (3 templates), create a DocuSeal template in DocuSeal UI:
   - Upload filled RTR PDF sample
   - Add signature/text fields at correct positions
   - Assign fields to "Candidate" role
   - Save template → Get template ID
2. Store template IDs in database (new `rtr_templates` table)
3. Edge function uses correct template ID based on selected template

---

## Template Analysis Findings

Based on analysis of the three DOCX templates (see [RTR_TEMPLATE_FIELD_MAPPING.md](./RTR_TEMPLATE_FIELD_MAPPING.md) for details):

### Template Comparison

| Template | Total Fields | Recruiter-Fillable | Candidate-Fillable | Hardcoded Fields |
|----------|-------------|-------------------|-------------------|------------------|
| **Employer** (RTR by Vendor) | 10 | 7 | 3 | 0 |
| **Generic** (RTR by Candidate) | 9 | 7 | 2 | 0 |
| **IBM** (RTR for IBM roles) | 6 | 4 | 2 | 4 *(Updated 2026-02-27)* |

### Key Differences

1. **Employer Template**:
   - Unique field: "Vendor Name" (company signing on behalf of candidate)
   - Candidate name is fillable (vendor represents candidate)
   - 10 total dynamic fields

2. **Generic Template**:
   - Most common pattern (candidate signs directly)
   - Candidate name is recruiter-fillable (pre-filled)
   - 9 total dynamic fields

3. **IBM Template** *(Updated 2026-02-27)*:
   - Specialized for IBM/APOLLO GLOBAL roles with some hardcoded values:
     - Subcontractor: "IBM-VRN"
     - Client: "IBM's partner client, APOLLO GLOBAL"
     - Location: "Bryant Park – New York City"
     - Schedule: "40-hour/week schedule"
   - 6 dynamic fields: date, candidate name, **rate**, **duration/contract type**, candidate address, position
   - **Recent change**: Rate and contract type changed from hardcoded to fillable
   - Can be used for different IBM roles with varying rates/contract types

### Implications

- **Field structure varies significantly** between templates (6-10 fields)
- **Field order matters** - placeholders must be replaced in sequence
- **Hardcoded fields** require special handling (IBM template has 4 hardcoded values)
- **Dynamic field loading** is essential - cannot use fixed field list
- **Template selection** must be first step in UI flow
- **IBM template flexibility**: Rate/duration now dynamic allows use across different IBM roles

---

## Proposed Solution Architecture

### 1. **Database Changes**

#### New Table: `rtr_templates`
```sql
CREATE TABLE public.rtr_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL, -- "RTR by Vendor", "RTR by Candidate", "RTR for IBM roles"
  description TEXT,
  docx_filename TEXT NOT NULL, -- "Employer_CompSciPrep_RTR_Styled.docx"
  docuseal_template_id TEXT, -- DocuSeal template ID (pre-configured with fields)
  field_config JSONB NOT NULL, -- Dynamic field definitions
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_rtr_templates_org ON rtr_templates(organization_id);
CREATE INDEX idx_rtr_templates_active ON rtr_templates(is_active, display_order);
```

#### Field Config Structure (JSONB):
```json
{
  "fields": [
    {
      "key": "sign_date",
      "label": "Sign date (e.g. 6th day of February 2026)",
      "type": "text",
      "recruiterFillable": true,
      "order": 1,
      "placeholder": "[_______________________]"
    },
    {
      "key": "candidate_name",
      "label": "Candidate name",
      "type": "text",
      "recruiterFillable": true,
      "order": 2,
      "placeholder": "[_______________________]"
    },
    {
      "key": "candidate_address",
      "label": "Candidate address",
      "type": "text",
      "recruiterFillable": false,
      "order": 3,
      "placeholder": "[_______________________]",
      "pdfField": {
        "name": "candidate_address",
        "page": 0,
        "x": 255,
        "y": 627,
        "width": 210,
        "height": 15
      }
    }
  ],
  "candidateFields": ["candidate_address", "candidate_signature", "printed_name", "ssn_last_four", "date"]
}
```

#### Modify `rtr_documents` Table:
```sql
ALTER TABLE rtr_documents
ADD COLUMN template_id UUID REFERENCES rtr_templates(id),
ADD COLUMN to_email TEXT, -- Store To email (may differ from candidate email if edited)
ADD COLUMN cc_emails TEXT[], -- Store CC'd emails (from editable CC field)
ADD COLUMN bcc_emails TEXT[], -- Store BCC'd emails (recruiter + account manager)
ADD COLUMN template_name TEXT; -- Denormalized for historical tracking
```

### 2. **Edge Function Changes** (`send-rtr-email/index.ts`)

#### New Request Body:
```typescript
type Body = {
  toEmail: string; // Editable (defaults to candidate email)
  ccEmails?: string[]; // NEW: CC recipients (from editable CC field)
  subject: string;
  body: string;
  rate: string;
  rtrFields?: Record<string, string>;
  templateId: string; // NEW: Which template to use
  organizationId?: string;
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
};
```

#### New Functions Needed:
```typescript
// Load template by ID
async function loadTemplateConfig(supabase, templateId): Promise<RTRTemplate> {
  // Fetch from rtr_templates table
  // Return: name, docx_filename, field_config, docuseal_template_id
}

// Load DOCX by filename
async function loadDocxByFilename(filename: string): Promise<Uint8Array> {
  // Check env vars, storage bucket, file system
  // Support multiple templates in docs/RTR Templates/
}

// Build placeholder values dynamically from field_config
function buildPlaceholderValuesDynamic(
  rtrFields: Record<string, string>,
  fieldConfig: FieldConfig[]
): (string | null)[] {
  // Map fields in order from field_config
  // Skip candidate-fillable fields (return null)
}

// Add fillable fields dynamically from field_config
async function addFillableFieldsToPdfDynamic(
  pdfBytes: Uint8Array,
  fieldConfig: FieldConfig[]
): Promise<Uint8Array> {
  // Add only candidate-fillable fields based on pdfField coords in config
}
```

#### Modified Flow:
```
1. Load template config from rtr_templates table by templateId
2. Load DOCX file by filename from config
3. Build placeholder values dynamically from field_config
4. Merge values into DOCX
5. Convert to PDF
6. Add fillable fields dynamically from field_config
7. Upload to DocuSeal using template's docuseal_template_id
8. Fetch recruiter + account manager emails for BCC
9. Send email with To (editable) + CC (editable) + BCC (auto-added)
10. Store in rtr_documents with template_id, to_email, cc_emails, bcc_emails
```

#### Email BCC Implementation:
```typescript
// Get recruiter for the job (from job_postings or application)
const { data: recruiterData } = await supabase
  .from('job_postings')
  .select('created_by')
  .eq('id', jobId)
  .single();

const recruiterId = recruiterData?.created_by;

// Get recruiter's email
const { data: recruiterProfile } = await supabase
  .from('user_profiles')
  .select('email')
  .eq('id', recruiterId)
  .single();

// Get account manager for this recruiter
// Structure: account_manager_recruiter_assignments has (account_manager_user_id, recruiter_user_id)
const { data: amAssignment } = await supabase
  .from('account_manager_recruiter_assignments')
  .select('account_manager_user_id')
  .eq('organization_id', organizationId)
  .eq('recruiter_user_id', recruiterId)
  .single();

// Get account manager's email
const { data: amProfile } = await supabase
  .from('user_profiles')
  .select('email')
  .eq('id', amAssignment?.account_manager_user_id)
  .single();

// BCC: Recruiter + Account Manager (auto-added, not visible to candidate)
const bccEmails = [
  recruiterProfile?.email,
  amProfile?.email
].filter(Boolean);

// CC: From editable CC field in UI (may be empty)
const ccEmails = body.ccEmails || [];

// Add to email payload (Resend)
emailPayload.cc = ccEmails;
emailPayload.bcc = bccEmails;

// Add to SMTP
client.send({
  from: fromEmail,
  to: body.toEmail, // Editable To field
  cc: ccEmails, // Editable CC field
  bcc: bccEmails, // Auto-added BCC
  subject,
  ...
});
```

### 3. **Frontend Changes** (`CandidatePipeline.tsx`)

#### New State:
```typescript
const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
const [availableTemplates, setAvailableTemplates] = useState<RTRTemplate[]>([]);
const [dynamicFields, setDynamicFields] = useState<FieldDef[]>([]);
```

#### New Query:
```typescript
// Load available templates for organization
const { data: rtrTemplates } = useQuery({
  queryKey: ['rtr-templates', organizationId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('rtr_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('display_order');
    if (error) throw error;
    return data;
  },
  enabled: !!organizationId
});
```

#### Modified Popup UI:
```tsx
<PipelineModal open={!!rtrPending} ...>
  {/* Step 1: Template Selection */}
  <div className="space-y-2">
    <Label>Select RTR Template</Label>
    <Select
      value={selectedTemplateId}
      onValueChange={(id) => {
        setSelectedTemplateId(id);
        const template = rtrTemplates?.find(t => t.id === id);
        if (template) {
          const recruiterFields = template.field_config.fields
            .filter(f => f.recruiterFillable)
            .sort((a, b) => a.order - b.order);
          setDynamicFields(recruiterFields);
          // Reset field values
          setRtrFieldValues({});
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Choose template..." />
      </SelectTrigger>
      <SelectContent>
        {rtrTemplates?.map(t => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {/* Step 2: Dynamic Fields (only after template selected) */}
  {selectedTemplateId && dynamicFields.length > 0 && (
    <div className="space-y-2">
      <Label className="font-medium">RTR form fields (pre-filled in PDF)</Label>
      <ScrollArea className="h-[220px] rounded-md border p-3">
        <div className="space-y-3">
          {dynamicFields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                value={rtrFieldValues[f.key] ?? ''}
                onChange={(e) => setRtrFieldValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="font-sans text-sm"
                placeholder={f.label}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )}

  {/* Email fields */}
  <div className="space-y-2">
    <Label>To (editable)</Label>
    <Input
      value={rtrTo}
      onChange={(e) => setRtrTo(e.target.value)}
      placeholder="candidate@example.com"
    />
  </div>

  <div className="space-y-2">
    <Label>CC (optional, editable)</Label>
    <Input
      value={rtrCc}
      onChange={(e) => setRtrCc(e.target.value)}
      placeholder="additional@example.com, another@example.com"
    />
    <p className="text-xs text-muted-foreground">
      Separate multiple emails with commas. Recruiter and Account Manager will be automatically BCC'd.
    </p>
  </div>

  {/* Subject and Body */}
  ...

  {/* Send button */}
  <Button
    disabled={
      sendingRtr ||
      !selectedTemplateId || // NEW: Template must be selected
      !rtrTo.trim() ||
      !rtrSubject.trim() ||
      !rtrBody.trim() ||
      !organizationId
    }
    onClick={async () => {
      const { data, error } = await invokeFunction('send-rtr-email', {
        body: {
          toEmail: rtrTo.trim(),
          subject: rtrSubject.trim(),
          body: rtrBody.trim(),
          rate: rtrFieldValues.rate || '',
          rtrFields: rtrFieldValues,
          templateId: selectedTemplateId, // NEW
          organizationId,
          candidateId: rtrPending.app.candidate_id,
          jobId: rtrPending.app.job_id,
          applicationId: rtrPending.app.id,
        },
      });
      ...
    }}
  >
    Send RTR & move to RTR & rate
  </Button>
</PipelineModal>
```

### 4. **Template Management UI** (Optional but Recommended)

**New Page**: `/settings/rtr-templates`

**Features**:
- List all RTR templates for organization
- Add/Edit/Delete templates
- Upload DOCX files
- Configure field mappings
- Enter DocuSeal template IDs
- Set display order
- Mark as active/inactive

**Without this UI**: Templates must be inserted via SQL or Supabase dashboard

### 5. **DocuSeal Setup Process** (Per Template)

#### For Each Template (3 templates):

**Step 1**: Create filled sample PDF
```bash
# Use edge function once with test data to generate filled PDF
# Download PDF from email or save from DocuSeal test
```

**Step 2**: Create DocuSeal Template
1. Login to DocuSeal dashboard
2. Templates → Create Template → Upload PDF
3. Add fields:
   - Drag "Signature" field to signature location
   - Drag "Text" field to each candidate-fillable location
   - Set role: "Candidate"
   - Name fields: `candidate_address`, `candidate_signature`, `printed_name`, `ssn_last_four`, `date`
4. Save template → Copy template ID (e.g., `tpl_abc123xyz`)

**Step 3**: Store in Database
```sql
INSERT INTO rtr_templates (
  organization_id,
  name,
  docx_filename,
  docuseal_template_id,
  field_config,
  display_order
) VALUES (
  '<org-id>',
  'RTR by Vendor',
  'Employer_CompSciPrep_RTR_Styled.docx',
  'tpl_abc123xyz', -- From DocuSeal
  '{"fields": [...]}', -- Field configuration JSON
  1
);
```

**Step 4**: Test
- Drag candidate to RTR stage
- Select "RTR by Vendor" template
- Fill fields
- Send
- Candidate should receive email with signing link
- Click link → DocuSeal opens with pre-positioned fields

---

## Implementation Plan & Estimation

### Phase 1: Database & Schema (4-6 hours)
**Tasks**:
- [ ] Create `rtr_templates` table migration
- [ ] Add `template_id`, `cc_emails`, `template_name` to `rtr_documents`
- [ ] Create RLS policies for `rtr_templates`
- [ ] Seed 3 initial templates (with dummy DocuSeal IDs for now)
- [ ] Test migrations locally and apply to production

**Files to Create/Modify**:
- `supabase/migrations/YYYYMMDD_create_rtr_templates.sql`
- `supabase/migrations/YYYYMMDD_modify_rtr_documents.sql`

**Estimation**: 4-6 hours

### Phase 2: Edge Function Refactor (8-10 hours)
**Tasks**:
- [ ] Add `templateId` and `ccEmails` to request body type
- [ ] Implement `loadTemplateConfig()` to fetch from database
- [ ] Implement `loadDocxByFilename()` to support multiple templates
- [ ] Refactor `buildPlaceholderValues()` to use dynamic field config
- [ ] Refactor `addFillableFieldsToPdf()` to use dynamic field coords
- [ ] Update `uploadToDocuSeal()` to accept template ID parameter
- [ ] Fetch recruiter + account manager emails from job assignments
- [ ] Add CC support to both Resend and SMTP email sending
- [ ] Update database insert to include `template_id` and `cc_emails`
- [ ] Add error handling for missing template
- [ ] Test with all 3 templates locally

**Files to Modify**:
- `supabase/functions/send-rtr-email/index.ts` (major refactor)
- `supabase/functions/send-rtr-email/docuseal.ts` (minor changes)

**Estimation**: 8-10 hours

### Phase 3: Frontend Template Selection (6-8 hours)
**Tasks**:
- [ ] Add template query to load `rtr_templates` for organization
- [ ] Add template selection dropdown to RTR popup
- [ ] Add state for `selectedTemplateId` and `dynamicFields`
- [ ] Update field rendering to use dynamic fields from template config
- [ ] Handle template change (reset field values, load new fields)
- [ ] Update send button validation to require template selection
- [ ] Pass `templateId` to edge function call
- [ ] Update TypeScript types for new request shape
- [ ] Test template switching and field rendering
- [ ] Test end-to-end flow with all 3 templates

**Files to Modify**:
- `src/pages/recruiter/CandidatePipeline.tsx`
- `src/lib/rtrFields.ts` (may become deprecated or used as fallback)

**Estimation**: 6-8 hours

### Phase 4: DocuSeal Configuration (4-6 hours)
**Tasks**:
- [ ] Generate 3 sample filled PDFs (one per template)
- [ ] Create 3 DocuSeal templates in DocuSeal dashboard
- [ ] Position candidate fields on each template
- [ ] Test signing flow for each template
- [ ] Copy template IDs and update database records
- [ ] Document the process for future templates
- [ ] Test end-to-end with actual DocuSeal signing

**Files to Create**:
- `docs/DOCUSEAL_SETUP.md` (instructions for adding new templates)

**Estimation**: 4-6 hours

### Phase 5: Template Management UI (Optional) (8-12 hours)
**Tasks**:
- [ ] Create `/settings/rtr-templates` page
- [ ] List templates (table with name, active status, actions)
- [ ] Add template form (name, description, DOCX upload, DocuSeal ID)
- [ ] Edit template (update config, reorder, deactivate)
- [ ] Field config editor (add/remove/reorder fields)
- [ ] File upload to storage bucket or base64 encode
- [ ] Validation and error handling
- [ ] Test CRUD operations
- [ ] Add to settings navigation

**Files to Create**:
- `src/pages/settings/RTRTemplates.tsx`
- `src/components/settings/RTRTemplateForm.tsx`
- `src/components/settings/FieldConfigEditor.tsx`

**Estimation**: 8-12 hours (if needed)

### Phase 6: Testing & Documentation (2-3 hours)
**Tasks**:
- [ ] Test all 3 templates end-to-end
- [ ] Test CC functionality (recruiter + account manager receive emails)
- [ ] Test DocuSeal signing for each template
- [ ] Test error cases (missing template, invalid fields, DocuSeal failure)
- [ ] Update RTR documentation
- [ ] Create migration guide from old to new system
- [ ] Document field config JSON schema

**Files to Create/Modify**:
- `docs/RTR_MULTI_TEMPLATE_GUIDE.md`
- Update `docs/REGRESSION_TEST_SUITE.md` with RTR tests

**Estimation**: 2-3 hours

---

## Total Estimation

### With Template Management UI:
- **Minimum**: 32 hours (4 days)
- **Maximum**: 45 hours (5.6 days)
- **Realistic**: 38 hours (4.75 days)

### Without Template Management UI (Manual DB inserts):
- **Minimum**: 24 hours (3 days)
- **Maximum**: 33 hours (4.1 days)
- **Realistic**: 28 hours (3.5 days)

---

## Risks & Considerations

### 1. **Template Format Variations**
**Risk**: Different templates may have different placeholder formats or layouts
**Mitigation**:
- Analyze all 3 templates first to ensure consistent placeholder format
- If formats differ significantly, may need template-specific merge logic
- Consider enforcing template standards (all use 23-underscore placeholders)

### 2. **DocuSeal Field Positioning**
**Risk**: Field coordinates in PDF may shift during DOCX→PDF conversion
**Mitigation**:
- Use consistent conversion service (CloudConvert preferred)
- Test field positions after conversion
- Document exact positions for each template
- Consider using DocuSeal's auto-detect feature instead of hardcoded coords

### 3. **Field Config Complexity**
**Risk**: Field configuration JSON may become complex to manage manually
**Mitigation**:
- Build template management UI (Phase 5)
- Provide validation schema for field config
- Create helper scripts to generate field config from template analysis

### 4. **Backward Compatibility**
**Risk**: Existing RTR records reference old single template
**Mitigation**:
- Keep old template as "default" in database
- Migration script to create template record for existing template
- Update existing `rtr_documents` to reference default template

### 5. **CC Email Failures**
**Risk**: Recruiter or account manager email not found
**Mitigation**:
- Make CC emails optional (don't fail if missing)
- Log warning when CC emails cannot be determined
- Allow manual CC override in UI

---

## Migration Strategy

### For Existing RTR System:

**Step 1**: Create default template record
```sql
INSERT INTO rtr_templates (
  organization_id,
  name,
  docx_filename,
  docuseal_template_id,
  field_config,
  is_active,
  display_order
) VALUES (
  '<org-id>',
  'Default RTR Template (Legacy)',
  'CompSciPrep_RTR_Template.docx',
  NULL, -- Existing DocuSeal setup
  '{"fields": [...]}', -- Current rtrFields.ts converted to JSON
  true,
  0
);
```

**Step 2**: Update existing `rtr_documents` records
```sql
UPDATE rtr_documents
SET template_id = (SELECT id FROM rtr_templates WHERE name = 'Default RTR Template (Legacy)')
WHERE template_id IS NULL;
```

**Step 3**: Deploy new code (backward compatible)
- Edge function checks if `templateId` provided, else uses default
- Frontend shows template selector, but pre-selects default if only one template

**Step 4**: Add new templates gradually
- Add "RTR by Vendor" template
- Add "RTR by Candidate" template
- Add "RTR for IBM roles" template
- Each with its own DocuSeal configuration

---

## Recommendations

### Priority 1 (Must Have):
1. ✅ Database schema for templates
2. ✅ Edge function refactor for dynamic templates
3. ✅ Frontend template selection UI
4. ✅ DocuSeal configuration per template
5. ✅ CC email functionality

### Priority 2 (Should Have):
6. ✅ Template management UI (makes future templates easier)
7. ✅ Migration from old to new system
8. ✅ Comprehensive documentation

### Priority 3 (Nice to Have):
9. Field config validation UI
10. Template preview before sending
11. Template usage analytics
12. Template cloning/duplication feature

---

## Questions for User

### Answered by Template Analysis ✅:
1. ~~**Template Placeholders**~~ - Confirmed: Placeholder lengths vary (4-39 underscores), but all use underscore pattern
2. ~~**Field Variations**~~ - Confirmed: Fields differ significantly (4-10 fields per template)

### Outstanding Questions:

1. **IBM Template Hardcoded Fields**: Should we allow overriding the hardcoded fields (client="APOLLO GLOBAL", rate="$90.00/hour", etc.) in the UI for flexibility, or keep them strictly fixed as-is in the template?

2. **Candidate Name in Employer Template**: In the Employer template, candidate name is left as a fillable field (candidate provides it). Should we still pre-fill it in the email body/subject, or respect the template design and leave it truly blank?

3. **Account Manager Lookup**: Confirmed `job_recruiter_assignments` table exists. Does it have an `account_manager_id` column for BCC emails?

4. **Template Storage**: Should DOCX files be:
   - Stored in Supabase Storage bucket (scalable, version controlled)?
   - Kept in file system + bundled as base64 (current approach)?
   - Hybrid (bundle for deployment, storage for user uploads)?

5. **Template Management UI**: Do you want Phase 5 (admin UI to manage templates), or is manual SQL insertion acceptable for adding future templates?

6. **PDF Coordinates**: Should we:
   - Auto-calculate PDF field coordinates using a script?
   - Require manual configuration per template?
   - Use DocuSeal's auto-detect feature (if available)?

7. **Existing Records**: Should we backfill existing `rtr_documents` records with a "default" template reference for historical tracking?

---

## Next Steps

**Before Starting**:
1. Review this analysis document
2. Answer questions above
3. Confirm estimation and timeline
4. Prioritize phases (all 6 or skip Phase 5?)

**To Begin**:
1. Create feature branch: `feature/rtr-multi-template`
2. Start with Phase 1 (database schema)
3. Test each phase thoroughly before moving to next
4. Regular check-ins after each phase completion
