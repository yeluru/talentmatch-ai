import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { organizationId: string };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const organizationId = body?.organizationId ? String(body.organizationId).trim() : null;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Missing organizationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roles } = await svc
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .in("role", ["recruiter", "account_manager", "org_admin", "super_admin"]);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rolesData } = await svc
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "account_manager");
    const userIds = (rolesData ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ accountManagers: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: profiles } = await svc
      .from("profiles")
      .select("user_id, email, full_name")
      .in("user_id", userIds);

    const accountManagers = (profiles ?? [])
      .map((p: { user_id: string; email: string | null; full_name: string | null }) => ({
        user_id: p.user_id,
        email: (p.email || "").trim().toLowerCase(),
        full_name: (p.full_name || p.email?.split("@")[0] || "Account Manager").trim(),
      }))
      .filter((a: { email: string }) => a.email);

    return new Response(
      JSON.stringify({ accountManagers }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
