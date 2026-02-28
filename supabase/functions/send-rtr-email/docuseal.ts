/**
 * DocuSeal API integration for RTR document signing
 * Docs: https://www.docuseal.com/docs/api
 */

interface DocuSealSubmission {
  submissionId: string;
  signingUrl: string;
  templateId: string;
}

interface DocuSealField {
  name: string;
  type: "text" | "signature" | "date" | "number";
  page: number;
  required?: boolean;
  x?: number;  // Position in pixels (optional, DocuSeal can auto-detect)
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Encode Uint8Array to base64 (for PDF upload)
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

/**
 * Map and filter field names for DocuSeal templates
 * - Maps field names to match DocuSeal template field names
 * - Excludes candidate-fillable fields (they should remain empty for candidate to fill)
 * - Only includes fields that exist in the specific template
 */
function mapFieldNamesForDocuSeal(
  rtrFields: Record<string, string>,
  templateId: string
): Record<string, string> {
  const mapped: Record<string, string> = {};

  // Fields that candidates fill (exclude from pre-filling)
  const candidateFillableFields = [
    'vendor_contact',
    'vendor_contact_signature',
    'vendor_contact_printed_name',
    'candidate_signature',
    'candidate_printed_name',
    'candidate_name_typed',
    'candidate_dob',
    'candidate_ssn',
    'candidate_sign_date',
    'date_signed',
    'company_name',
    'company_ein',
  ];

  // Template 2985588: RTR by Vendor (Employer)
  // Fields in DocuSeal: sign_date, vendor, client, client_location, rate, contact_type,
  //                     candidate_name, candidate_address, position_title
  if (templateId === '2985588') {
    const allowedFields = [
      'sign_date', 'client', 'client_location', 'rate',
      'candidate_name', 'candidate_address', 'position_title'
    ];

    for (const [key, value] of Object.entries(rtrFields)) {
      // Skip candidate-fillable fields
      if (candidateFillableFields.includes(key)) {
        continue;
      }

      // Map and filter
      if (key === 'vendor_name') {
        mapped.vendor = value;
      } else if (key === 'vendor' && !mapped.vendor) {
        mapped.vendor = value;
      } else if (key === 'duration') {
        mapped.contact_type = value;
      } else if (key === 'contact_type' && !mapped.contact_type) {
        mapped.contact_type = value;
      } else if (allowedFields.includes(key)) {
        mapped[key] = value;
      }
      // All other fields (subcontractor, client_partner, etc.) are ignored
    }
  }
  // Template 2986303: RTR by Candidate (Generic)
  // Fields in DocuSeal: sign_date, candidate_name, prime_vendor, client_name_1, client_name_2,
  //                     client_location, rate, contract_type, position_title, candidate_address
  else if (templateId === '2986303') {
    const allowedFields = [
      'sign_date', 'candidate_name', 'client_location', 'rate',
      'candidate_address', 'position_title'
    ];

    for (const [key, value] of Object.entries(rtrFields)) {
      // Skip candidate-fillable fields
      if (candidateFillableFields.includes(key)) {
        continue;
      }

      // Map and filter
      if (key === 'subcontractor') {
        mapped.prime_vendor = value;
      } else if (key === 'duration') {
        mapped.contract_type = value;
      } else if (key === 'client') {
        // Client value goes to both client_name_1 and client_name_2
        mapped.client_name_1 = value;
        mapped.client_name_2 = value;
      } else if (allowedFields.includes(key)) {
        mapped[key] = value;
      }
      // All other fields are ignored
    }
  }
  // Template 2986320: RTR for IBM roles
  // Fields in DocuSeal: sign_date, candidate_name, rate, contract_type, candidate_address
  // Note: Hardcoded fields (schedule, subcontractor, client_partner, client_location) are merged into PDF before DocuSeal
  else if (templateId === '2986320') {
    const allowedFields = [
      'sign_date', 'candidate_name', 'rate', 'candidate_address'
    ];

    for (const [key, value] of Object.entries(rtrFields)) {
      // Skip candidate-fillable fields
      if (candidateFillableFields.includes(key)) {
        continue;
      }

      // Map and filter
      if (key === 'duration') {
        mapped.contract_type = value;
      } else if (allowedFields.includes(key)) {
        mapped[key] = value;
      }
      // Hardcoded fields and other fields are ignored (already in PDF)
    }
  } else {
    // For other templates, just exclude candidate-fillable fields
    // TODO: Add specific field mappings for other templates when configured
    for (const [key, value] of Object.entries(rtrFields)) {
      if (!candidateFillableFields.includes(key)) {
        mapped[key] = value;
      }
    }
  }

  return mapped;
}

/**
 * Upload PDF to DocuSeal and create signing request
 *
 * @param pdfBytes - The merged RTR PDF bytes
 * @param signerEmail - Candidate's email
 * @param signerName - Candidate's name
 * @returns Submission ID and signing URL
 */
export async function uploadToDocuSeal(
  pdfBytes: Uint8Array,
  signerEmail: string,
  signerName: string,
  docusealTemplateId?: string | null,
  prefilledFields?: Record<string, string>
): Promise<DocuSealSubmission> {
  const apiKey = Deno.env.get("DOCUSEAL_API_KEY");
  if (!apiKey) {
    throw new Error("DOCUSEAL_API_KEY not set. Set it in Supabase Edge Function secrets.");
  }

  const baseUrl = (Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com").replace(/\/$/, "");

  // Check if a reusable template ID is configured
  const reuseTemplateId = Deno.env.get("DOCUSEAL_RTR_TEMPLATE_ID");

  console.info("[DocuSeal] Creating submission for", signerEmail);

  try {
    let templateId: string;

    // Use provided template ID (from database) if available
    if (docusealTemplateId) {
      console.info("[DocuSeal] Using template from database:", docusealTemplateId);
      templateId = docusealTemplateId;
    } else if (reuseTemplateId) {
      // Fallback to env var template (legacy)
      console.info("[DocuSeal] Using reusable template from env:", reuseTemplateId);
      templateId = reuseTemplateId;
    } else {
      // Create one-time template from PDF (for testing only)
      // NOTE: This creates a template WITHOUT field positions, so it will fail at submission
      // To use this approach, you must either:
      // 1. Set DOCUSEAL_RTR_TEMPLATE_ID to a pre-created template ID, OR
      // 2. Manually add fields to the created template via DocuSeal UI before submission
      console.warn("[DocuSeal] No DOCUSEAL_RTR_TEMPLATE_ID set. Creating one-time template (will need manual field setup).");

      const templatePayload = {
        name: `RTR - ${signerName} - ${new Date().toISOString()}`,
        documents: [{
          name: "RTR.pdf",
          file: bytesToBase64(pdfBytes)
        }]
      };

      console.info("[DocuSeal] Creating template...");
      const templateRes = await fetch(`${baseUrl}/templates/pdf`, {
        method: "POST",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templatePayload)
      });

      if (!templateRes.ok) {
        const errorText = await templateRes.text();
        throw new Error(`DocuSeal template creation failed (${templateRes.status}): ${errorText}`);
      }

      const template = await templateRes.json();
      templateId = template.id;
      console.info("[DocuSeal] Template created:", templateId);
      console.warn("[DocuSeal] IMPORTANT: This template has no fields. Either:");
      console.warn("  1. Set DOCUSEAL_RTR_TEMPLATE_ID to a pre-created template, OR");
      console.warn("  2. Go to DocuSeal UI and add signature fields to template:", templateId);
    }

    // Create submission (signing request)
    // Build submitter object with optional pre-filled fields
    const submitter: any = {
      email: signerEmail,
      name: signerName,
      role: "First Party"  // Must match the role name defined in DocuSeal template
    };

    // Map and filter fields for DocuSeal
    if (prefilledFields && Object.keys(prefilledFields).length > 0) {
      const mappedFields = mapFieldNamesForDocuSeal(prefilledFields, templateId);

      if (Object.keys(mappedFields).length > 0) {
        submitter.fields = Object.entries(mappedFields).map(([name, value]) => ({
          name,
          default_value: value,
          readonly: true  // Make recruiter-filled fields read-only for candidate
        }));
        console.info("[DocuSeal] Pre-filling", submitter.fields.length, "fields:", Object.keys(mappedFields));
      }
    }

    // Use DocuSeal's template PDF (don't upload our own)
    // This way DocuSeal uses the template with pre-defined field positions
    const submissionPayload = {
      template_id: templateId,
      // NOTE: Removed documents array - DocuSeal will use the template's PDF
      // Our merged PDF with recruiter values is not being used by DocuSeal correctly
      // To make pre-filling work: recreate templates in DocuSeal with field names matching our form
      send_email: false, // We'll send our own email with custom branding
      submitters: [submitter]
    };

    console.info("[DocuSeal] Creating submission...");
    const submissionRes = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submissionPayload)
    });

    if (!submissionRes.ok) {
      const errorText = await submissionRes.text();
      throw new Error(`DocuSeal submission creation failed (${submissionRes.status}): ${errorText}`);
    }

    const submitters = await submissionRes.json();
    console.info("[DocuSeal] Submission created");

    // DocuSeal API returns an array of submitter objects
    if (!Array.isArray(submitters) || submitters.length === 0) {
      console.error("[DocuSeal] Unexpected response format:", JSON.stringify(submitters, null, 2));
      throw new Error("DocuSeal did not return submitters array");
    }

    const responseSubmitter = submitters[0];
    const submissionId = responseSubmitter.submission_id || responseSubmitter.id;
    const signingUrl = responseSubmitter.embed_src;

    if (!signingUrl) {
      console.error("[DocuSeal] No embed_src in submitter:", JSON.stringify(responseSubmitter, null, 2));
      throw new Error("DocuSeal did not return signing URL (embed_src)");
    }

    console.info("[DocuSeal] Submission ID:", submissionId);
    console.info("[DocuSeal] Signing URL:", signingUrl);

    return {
      submissionId: String(submissionId),
      signingUrl: signingUrl,
      templateId: templateId
    };

  } catch (error) {
    console.error("[DocuSeal] Error:", error);
    throw error;
  }
}

/**
 * Get submission status from DocuSeal
 *
 * @param submissionId - DocuSeal submission ID
 * @returns Submission data including status
 */
export async function getSubmissionStatus(submissionId: string): Promise<any> {
  const apiKey = Deno.env.get("DOCUSEAL_API_KEY");
  if (!apiKey) {
    throw new Error("DOCUSEAL_API_KEY not set");
  }

  const baseUrl = (Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com").replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/submissions/${submissionId}`, {
    headers: {
      "X-Auth-Token": apiKey,
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to get submission status: ${res.status}`);
  }

  return await res.json();
}
