# RTR Multi-Template System - Implementation Progress

## Status: In Progress

**Started**: 2026-02-27
**Current Phase**: Phase 2 (Edge Function Refactoring)

---

## ✅ Phase 1: Database Schema (COMPLETE)

**Duration**: ~1 hour
**Status**: ✅ Complete - Applied to production

### Migrations Created & Applied:
- ✅ `20260227170000_create_rtr_templates_table.sql`
  - Created `rtr_templates` table with JSONB field_config
  - Added RLS policies for org admins and staff
  - Added indexes for performance

- ✅ `20260227170001_modify_rtr_documents_for_templates.sql`
  - Added `template_id` column (references rtr_templates)
  - Added `to_email` column (editable To field)
  - Added `cc_emails[]` array (editable CC field)
  - Added `bcc_emails[]` array (recruiter + account manager)
  - Added `template_name` for historical tracking

- ✅ `20260227170002_seed_rtr_templates.sql`
  - Seeded 3 templates with full field_config JSONB
  - Organization ID: `508d1a4e-a02a-4218-a72e-b64520556309`
  - Templates: RTR by Vendor, RTR by Candidate, RTR for IBM roles

### Pending User Action:

**DocuSeal Template IDs needed** - Once created in DocuSeal UI, run:

```sql
-- Update with actual DocuSeal template IDs
UPDATE rtr_templates
SET docuseal_template_id = 'tpl_abc123'  -- User to provide
WHERE name = 'RTR by Vendor';

UPDATE rtr_templates
SET docuseal_template_id = 'tpl_def456'  -- User to provide
WHERE name = 'RTR by Candidate';

UPDATE rtr_templates
SET docuseal_template_id = 'tpl_ghi789'  -- User to provide
WHERE name = 'RTR for IBM roles';
```

**Sample PDFs created** at: `docs/RTR Templates/samples/`
- `Employer_CompSciPrep_RTR_Styled_sample.pdf`
- `Generic_CompSciPrep_RTR_Styled_sample.pdf`
- `IBM_CompSciPrep_RTR_Styled_sample.pdf`

---

## 🚧 Phase 2: Edge Function Refactoring (IN PROGRESS)

**Estimated Duration**: 8-10 hours
**Status**: 🚧 In Progress

### Changes Needed:

#### 1. Update Request Body Type
```typescript
type Body = {
  toEmail: string;              // Editable
  ccEmails?: string[];          // NEW: Editable CC field
  subject: string;
  body: string;
  rate: string;
  rtrFields?: Record<string, string>;
  templateId: string;           // NEW: Which template to use
  organizationId?: string;
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
};
```

#### 2. New Functions to Create:

**`loadTemplateConfig(supabase, templateId)`**
- Fetch template from `rtr_templates` table
- Return: name, docx_filename, field_config, docuseal_template_id

**`loadDocxByFilename(filename)`**
- Load DOCX from `docs/RTR Templates/{filename}`
- Support: Employer, Generic, IBM templates
- Use same loading strategy as current `loadRtrTemplate()`

**`buildPlaceholderValuesDynamic(rtrFields, fieldConfig)`**
- Replace current hardcoded `buildPlaceholderValues()`
- Use field_config.fields array to determine order
- Skip candidate-fillable fields (recruiterFillable: false)
- Handle special cases (vendor_name, client_partner combination)

**`getRecruiterAndAccountManager(supabase, organizationId, jobId, recruiterId)`**
- Lookup recruiter email from user_profiles
- Lookup account manager via account_manager_recruiter_assignments
- Return: { recruiterEmail, accountManagerEmail }

#### 3. Modified Functions:

**`uploadToDocuSeal(pdfBytes, signerEmail, signerName, docusealTemplateId)`**
- Add `docusealTemplateId` parameter
- Use provided template ID instead of env var
- Upload filled PDF with submission:
  ```typescript
  const submissionPayload = {
    template_id: docusealTemplateId,
    documents: [{
      name: "RTR.pdf",
      file: bytesToBase64(pdfBytes)  // Upload filled PDF
    }],
    submitters: [...]
  };
  ```

**Main Handler**
- Load template config by templateId
- Load DOCX by filename
- Build placeholder values dynamically
- Get recruiter + account manager emails
- Add BCC to email
- Save to rtr_documents with new columns

#### 4. Files to Modify:
- `supabase/functions/send-rtr-email/index.ts` (major refactor)
- `supabase/functions/send-rtr-email/docuseal.ts` (add document upload to submission)

### Testing Checklist:
- [ ] Load template by ID from database
- [ ] Load correct DOCX file per template
- [ ] Dynamic placeholder replacement works
- [ ] BCC emails sent (recruiter + account manager)
- [ ] Filled PDF uploaded to DocuSeal with template ID
- [ ] Database record saved with template_id, to/cc/bcc emails
- [ ] Test all 3 templates end-to-end

---

## ⏳ Phase 3: Frontend Changes (PENDING)

**Estimated Duration**: 6-8 hours
**Status**: ⏳ Not Started

### Changes Needed:

#### 1. Update CandidatePipeline.tsx

**New State**:
```typescript
const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
const [availableTemplates, setAvailableTemplates] = useState<RTRTemplate[]>([]);
const [dynamicFields, setDynamicFields] = useState<FieldDef[]>([]);
const [rtrCc, setRtrCc] = useState<string>(''); // NEW: CC field
```

**New Query**:
```typescript
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
  }
});
```

**New UI Components**:
- Template selection dropdown (first step)
- Dynamic field rendering based on selected template
- Editable To field (pre-filled with candidate email)
- Editable CC field (empty, optional)
- BCC note: "Recruiter and Account Manager will be automatically BCC'd"

#### 2. Update Mutation:
```typescript
const { data, error } = await invokeFunction('send-rtr-email', {
  body: {
    toEmail: rtrTo.trim(),
    ccEmails: rtrCc.trim() ? rtrCc.split(',').map(e => e.trim()) : [],
    subject: rtrSubject.trim(),
    body: rtrBody.trim(),
    rate: rtrFieldValues.rate || '',
    rtrFields: rtrFieldValues,
    templateId: selectedTemplateId,  // NEW
    organizationId,
    candidateId,
    jobId,
    applicationId
  }
});
```

#### 3. Files to Modify:
- `src/pages/recruiter/CandidatePipeline.tsx` (RTR popup UI)

### Testing Checklist:
- [ ] Template dropdown shows 3 templates
- [ ] Fields update when template changes
- [ ] To field pre-filled, editable
- [ ] CC field empty, editable
- [ ] Form validation requires template selection
- [ ] Send button passes templateId to edge function
- [ ] Draft save/restore works with new fields

---

## ⏳ Phase 4: DocuSeal Configuration (PENDING - USER ACTION REQUIRED)

**Estimated Duration**: 4-6 hours
**Status**: ⏳ Waiting for User

### Steps (User Action):

For each of the 3 templates:

1. Upload sample PDF to DocuSeal UI
2. Drag fields for candidate-fillable areas:
   - Text fields: candidate_address, position_title, printed_name
   - Signature field: candidate_signature
   - Date field: date (optional)
3. Assign fields to "Candidate" role
4. Save template → Copy template ID
5. Run SQL to update rtr_templates table

### Expected Template IDs:
- Employer template: `tpl_________` (user provides)
- Generic template: `tpl_________` (user provides)
- IBM template: `tpl_________` (user provides)

---

## ⏳ Phase 5: Testing & Bug Fixes (PENDING)

**Estimated Duration**: 2-3 hours
**Status**: ⏳ Not Started

### Test Cases:
- [ ] End-to-end flow for Employer template
- [ ] End-to-end flow for Generic template
- [ ] End-to-end flow for IBM template
- [ ] BCC emails received by recruiter + account manager
- [ ] CC emails work correctly
- [ ] Editable To field works
- [ ] Candidate receives signing URL
- [ ] DocuSeal shows correct fillable fields
- [ ] Signed document saves correctly
- [ ] Database records complete with all columns

---

## ⏳ Phase 6: Documentation (PENDING)

**Estimated Duration**: 1-2 hours
**Status**: ⏳ Not Started

### Documents to Create/Update:
- [ ] Update RTR usage guide for recruiters
- [ ] Document how to add new templates (SQL + DocuSeal)
- [ ] Document field_config JSONB schema
- [ ] Add to regression test suite

---

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Database | 1 hour | ✅ Complete |
| Phase 2: Edge Function | 8-10 hours | 🚧 In Progress |
| Phase 3: Frontend | 6-8 hours | ⏳ Pending |
| Phase 4: DocuSeal | 4-6 hours | ⏳ Pending (User) |
| Phase 5: Testing | 2-3 hours | ⏳ Pending |
| Phase 6: Documentation | 1-2 hours | ⏳ Pending |
| **Total** | **22-30 hours** | **~5% Complete** |

---

## Blockers

1. **DocuSeal Template IDs** - User needs to create templates and provide IDs
   - Can proceed with Phases 2-3 without them
   - Phase 4 testing requires actual template IDs

---

## Next Steps

**Immediate**:
1. ✅ Complete Phase 2 (Edge Function refactoring)
2. ✅ Complete Phase 3 (Frontend changes)
3. ⏳ Wait for user to create DocuSeal templates
4. Test end-to-end once template IDs available

**User Action Required**:
- Upload 3 sample PDFs to DocuSeal
- Mark fillable fields
- Provide 3 template IDs
- Run SQL update query

---

## Notes

- Migrations applied successfully to production
- Sample PDFs generated and ready for upload
- Field mappings documented in RTR_TEMPLATE_FIELD_MAPPING.md
- No template management UI needed (manual SQL acceptable)
- Existing RTR records left as-is (template_id = NULL for legacy)
