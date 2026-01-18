import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  organizationId: string;
  contentHash: string;
  source?: string; // e.g. "resume_upload"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const organizationId = String(body?.organizationId || "").trim();
    const contentHash = String(body?.contentHash || "").trim().slice(0, 128);
    const source = String(body?.source || "resume_upload").trim().slice(0, 80) || "resume_upload";

    if (!organizationId || !contentHash) {
      return new Response(JSON.stringify({ error: "Missing organizationId or contentHash" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify requester has access to this org
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .in("role", ["recruiter", "account_manager", "org_admin", "super_admin"])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find existing resume by hash
    const { data: resumeRow, error: resErr } = await supabase
      .from("resumes")
      .select("id, candidate_id, file_name, file_url, ats_score")
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (resErr) throw resErr;
    if (!resumeRow?.candidate_id) {
      return new Response(JSON.stringify({ ok: true, found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidateId = String(resumeRow.candidate_id);

    // Re-activate org link (safe "undelete" for Talent Pool)
    const { error: linkErr } = await supabase
      .from("candidate_org_links")
      .upsert({
        candidate_id: candidateId,
        organization_id: organizationId,
        link_type: source,
        status: "active",
        created_by: user.id,
      } as any);

    if (linkErr) throw linkErr;

    return new Response(
      JSON.stringify({
        ok: true,
        found: true,
        action: "relinked_existing_candidate",
        candidateId,
        resume: {
          id: resumeRow.id,
          file_name: resumeRow.file_name,
          file_url: resumeRow.file_url,
          ats_score: resumeRow.ats_score,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

