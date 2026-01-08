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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const email = (user.email || "").toLowerCase().trim();
    if (!email) {
      return new Response(JSON.stringify({ error: "User has no email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check allowlist (service role bypasses RLS)
    const { data: allow, error: allowErr } = await supabase
      .from("platform_admin_allowlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (allowErr) {
      return new Response(JSON.stringify({ error: allowErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allow) {
      return new Response(JSON.stringify({ ok: true, bootstrapped: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Grant role if missing
    const { data: existing } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from("user_roles").insert({
        user_id: user.id,
        role: "super_admin",
        organization_id: null,
      });
      if (insErr) throw insErr;

      try {
        await supabase.from("audit_logs").insert({
          organization_id: "00000000-0000-0000-0000-000000000000",
          user_id: user.id,
          action: "bootstrap_super_admin",
          entity_type: "user_role",
          entity_id: null,
          details: { email },
          ip_address: getRequestIp(req),
        });
      } catch {
        // ignore audit failure
      }
    }

    return new Response(JSON.stringify({ ok: true, bootstrapped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


