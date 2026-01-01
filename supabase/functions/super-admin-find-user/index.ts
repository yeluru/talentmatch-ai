import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type FindUserRequest = {
  email: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    console.log(`[super-admin-find-user] start requestId=${requestId}`);

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

    // Verify requester is super admin
    const { data: superAdminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!superAdminRole) {
      return new Response(JSON.stringify({ error: "Only super admins can look up users" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as FindUserRequest;
    const email = normalizeEmail(body?.email ?? "");
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // supabase-js admin API doesn't support direct email lookup, so we page through users.
    // This is OK for our small admin use case.
    const perPage = 200;
    const maxPages = 10; // 2000 users max scan

    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) {
        console.log(`[super-admin-find-user] found requestId=${requestId} userId=${found.id}`);
        return new Response(
          JSON.stringify({
            user: {
              id: found.id,
              email: found.email,
              created_at: found.created_at,
              last_sign_in_at: (found as any).last_sign_in_at ?? null,
              user_metadata: found.user_metadata ?? {},
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      if (data.users.length < perPage) break;
    }

    console.log(`[super-admin-find-user] not_found requestId=${requestId} email=${email}`);
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error(`[super-admin-find-user] error requestId=${requestId}:`, error);
    return new Response(JSON.stringify({ error: error.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
