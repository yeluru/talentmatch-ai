/**
 * One-time setup script to create a reusable DocuSeal template for RTR documents
 *
 * Run with: deno run --allow-net --allow-env --allow-read setup-docuseal-template.ts
 */

import { bytesToBase64 } from "./docuseal.ts";

async function createRtrTemplate() {
  // Read environment variables
  const apiKey = Deno.env.get("DOCUSEAL_API_KEY");
  if (!apiKey) {
    console.error("❌ DOCUSEAL_API_KEY not set");
    console.error("Set it with: export DOCUSEAL_API_KEY=your_key");
    Deno.exit(1);
  }

  const baseUrl = (Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com").replace(/\/$/, "");

  // Read the sample RTR PDF (we need a PDF to create the template)
  console.log("📄 Checking for RTR template PDF...");
  const docxPath = Deno.env.get("RTR_TEMPLATE_DOCX_PATH") || "docs/CompSciPrep_RTR_Template.docx";

  console.log(`⚠️  Note: This script needs a sample RTR PDF to create the template.`);
  console.log(`   You have two options:`);
  console.log(`   1. Generate a test RTR PDF first by running the RTR flow once`);
  console.log(`   2. Convert the DOCX template to PDF manually and save it`);
  console.log(``);
  console.log(`   For now, I'll create a basic template that you'll configure in DocuSeal UI.`);
  console.log(``);

  // Create a minimal template without PDF upload
  // DocuSeal allows creating templates that you complete in their UI
  console.log("🔧 Creating DocuSeal template...");

  const templatePayload = {
    name: "RTR Document Template (CompSciPrep)",
    external_id: "rtr-compsciprep-main",
  };

  const response = await fetch(`${baseUrl}/templates`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(templatePayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to create template (${response.status}):`, errorText);
    Deno.exit(1);
  }

  const template = await response.json();
  const templateId = template.id || template.slug;

  console.log(``);
  console.log("✅ Template created successfully!");
  console.log(``);
  console.log("📋 Template ID:", templateId);
  console.log(``);
  console.log("🔗 Configure your template:");
  console.log(`   1. Go to: https://www.docuseal.com/templates/${templateId}`);
  console.log(`   2. Upload your RTR PDF document`);
  console.log(`   3. Add signature and form fields using the visual editor`);
  console.log(`   4. Set role as "Candidate" for all fields`);
  console.log(``);
  console.log("⚙️  Add this to your supabase/functions/.env file:");
  console.log(``);
  console.log(`DOCUSEAL_RTR_TEMPLATE_ID=${templateId}`);
  console.log(``);
  console.log("🔄 After configuring, restart your edge functions server");
}

// Run the setup
createRtrTemplate().catch((error) => {
  console.error("❌ Error:", error);
  Deno.exit(1);
});
