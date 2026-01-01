import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type UpsertProfileRequest = {
  userId: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    console.log(`[super-admin-upsert-profile] start requestId=${requestId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requester },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !requester) throw new Error("Unauthorized");

    const { data: superAdminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!superAdminRole) {
      return new Response(JSON.stringify({ error: "Only super admins can repair profiles" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as UpsertProfileRequest;
    const userId = (body?.userId ?? "").trim();
    if (!isUuid(userId)) {
      return new Response(JSON.stringify({ error: "Invalid userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: target, error: targetErr } = await supabase.auth.admin.getUserById(userId);
    if (targetErr) throw targetErr;
    if (!target?.user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const email = target.user.email ?? "";
    const fullName =
      (target.user.user_metadata as any)?.full_name ||
      (email ? email.split("@")[0] : "User");

    // Create profile if missing, otherwise gently update name/email.
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from("profiles").insert({
        user_id: userId,
        email: email || "unknown",
        full_name: fullName,
      });
      if (insertErr) throw insertErr;
    } else {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          email: email || "unknown",
          full_name: fullName,
        })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
    }

    console.log(`[super-admin-upsert-profile] ok requestId=${requestId} userId=${userId}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error(`[super-admin-upsert-profile] error requestId=${requestId}:`, error);
    return new Response(JSON.stringify({ error: error.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
