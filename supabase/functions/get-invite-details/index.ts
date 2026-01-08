import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GetInviteRequest {
  inviteToken: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { inviteToken }: GetInviteRequest = await req.json();

    if (!inviteToken) {
      return new Response(
        JSON.stringify({ error: "Missing invite token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch invite details using service role (bypasses RLS)
    // We support 3 invite types:
    // - org_admin_invites -> role: org_admin (tenant org super admin)
    // - manager_invites   -> role: account_manager
    // - recruiter_invites -> role: recruiter

    const findInvite = async (
      table: "org_admin_invites" | "manager_invites" | "recruiter_invites",
    ) => {
      const { data, error } = await supabase
        .from(table)
        .select("email, full_name, status, expires_at, organization_id")
        .eq("invite_token", inviteToken)
        .maybeSingle();
      return { invite: data, error };
    };

    const orgAdminRes = await findInvite("org_admin_invites");
    const managerRes = orgAdminRes.invite ? null : await findInvite("manager_invites");
    const recruiterRes = orgAdminRes.invite || managerRes?.invite
      ? null
      : await findInvite("recruiter_invites");

    const invite =
      orgAdminRes.invite ||
      managerRes?.invite ||
      recruiterRes?.invite;

    if (!invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const inviteRole = orgAdminRes.invite
      ? "org_admin"
      : managerRes?.invite
        ? "account_manager"
        : "recruiter";

    // Check if invite is still valid
    if (invite.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Invite already used" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Invite expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch organization name
    let organizationName = "";
    if (invite.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", invite.organization_id)
        .single();
      
      if (org) {
        organizationName = org.name;
      }
    }

    return new Response(
      JSON.stringify({
        email: (invite as any).email,
        fullName: (invite as any).full_name || "",
        organizationName,
        role: inviteRole,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("Error in get-invite-details function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
