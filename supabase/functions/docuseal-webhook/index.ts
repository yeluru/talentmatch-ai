/**
 * DocuSeal Webhook Handler
 *
 * Receives webhooks from DocuSeal when document events occur:
 * - submission.viewed: Candidate viewed the document
 * - submission.completed: Candidate signed the document
 * - submission.declined: Candidate declined to sign
 *
 * Docs: https://www.docuseal.com/docs/webhooks
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventType = payload.event_type || payload.event;
    const submission = payload.data || payload.submission;

    if (!eventType || !submission) {
      console.error("[docuseal-webhook] Missing event_type or data in payload:", payload);
      return new Response(
        JSON.stringify({ error: "Invalid webhook payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const submissionId = submission.id;
    if (!submissionId) {
      console.error("[docuseal-webhook] Missing submission.id");
      return new Response(
        JSON.stringify({ error: "Missing submission ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.info(`[docuseal-webhook] Received event: ${eventType} for submission: ${submissionId}`);

    // Build update object based on event type
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    switch (eventType) {
      case "submission.viewed":
      case "form.viewed":
        updates.status = "viewed";
        updates.viewed_at = new Date().toISOString();
        console.info(`[docuseal-webhook] Candidate viewed document: ${submissionId}`);
        break;

      case "submission.completed":
      case "form.completed":
        updates.status = "completed";
        updates.completed_at = new Date().toISOString();
        // Get signed document URL if available
        if (submission.documents && submission.documents.length > 0) {
          updates.signed_document_url = submission.documents[0].url;
        }
        console.info(`[docuseal-webhook] Candidate completed document: ${submissionId}`);
        break;

      case "submission.declined":
      case "form.declined":
        updates.status = "declined";
        updates.declined_at = new Date().toISOString();
        console.info(`[docuseal-webhook] Candidate declined document: ${submissionId}`);
        break;

      default:
        console.info(`[docuseal-webhook] Unhandled event type: ${eventType}`);
        // Still acknowledge the webhook
        return new Response(
          JSON.stringify({ success: true, message: "Event acknowledged but not processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Update RTR document in database
    const { error: updateError } = await supabase
      .from("rtr_documents")
      .update(updates)
      .eq("docuseal_submission_id", submissionId);

    if (updateError) {
      console.error("[docuseal-webhook] Failed to update RTR document:", updateError);
      return new Response(
        JSON.stringify({ error: "Database update failed", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.info(`[docuseal-webhook] Successfully updated RTR document: ${submissionId}`);

    // TODO: Optional - Send notification to recruiter when document is completed/declined
    if (updates.status === "completed" || updates.status === "declined") {
      // Get the RTR document to find the recruiter
      const { data: rtrDoc } = await supabase
        .from("rtr_documents")
        .select("created_by, organization_id, candidate_id")
        .eq("docuseal_submission_id", submissionId)
        .single();

      if (rtrDoc) {
        // Could insert a notification here for the recruiter
        console.info(`[docuseal-webhook] RTR ${updates.status} for candidate ${rtrDoc.candidate_id}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, event: eventType, submission_id: submissionId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[docuseal-webhook] Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
