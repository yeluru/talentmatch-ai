import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getRequestIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

type Body = {
  organizationId: string;
  candidateIds: string[];
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const organizationId = String(body?.organizationId || "").trim();
    const candidateIds = Array.isArray(body?.candidateIds) ? body.candidateIds.map(String) : [];

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Missing organizationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uniqCandidateIds = Array.from(new Set(candidateIds.map((c) => c.trim()).filter(Boolean))).slice(0, 200);
    if (uniqCandidateIds.length === 0) {
      return new Response(JSON.stringify({ error: "No candidateIds provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify requester is allowed for this org
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

    // Deactivate org link(s). This is the safe "delete" for Talent Pool.
    const { error: updErr, data: updData } = await supabase
      .from("candidate_org_links")
      .update({ status: "inactive" })
      .eq("organization_id", organizationId)
      .in("candidate_id", uniqCandidateIds)
      .select("candidate_id");

    if (updErr) throw updErr;

    // Best-effort audit log
    try {
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        user_id: user.id,
        action: "remove_from_talent_pool",
        entity_type: "candidate_org_link",
        entity_id: null,
        details: { candidate_ids: uniqCandidateIds },
        ip_address: getRequestIp(req),
      });
    } catch {
      // ignore audit failures
    }

    return new Response(
      JSON.stringify({
        ok: true,
        removed: Array.isArray(updData) ? updData.length : 0,
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

