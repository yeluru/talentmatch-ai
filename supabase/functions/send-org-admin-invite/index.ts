import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = (Deno.env.get("RESEND_FROM") || "UltraHire <onboarding@resend.dev>").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getRequestIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

interface CreateOrgAdminInviteRequest {
  email: string;
  fullName?: string;
  organizationName: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    return { skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  return res.json();
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Unauthorized");

    // Only platform super_admin can create orgs + org admins
    const { data: superRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!superRole) throw new Error("Only platform super admins can invite org admins");

    const { email, fullName, organizationName }: CreateOrgAdminInviteRequest =
      await req.json();

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: organizationName })
      .select("id, name")
      .single();
    if (orgError) throw orgError;

    const inviteToken = crypto.randomUUID();

    // Create org admin invite
    const { data: inviteRow, error: inviteError } = await supabase
      .from("org_admin_invites")
      .insert({
        email,
        full_name: fullName,
        organization_id: org.id,
        invited_by: user.id,
        invite_token: inviteToken,
      })
      .select("id")
      .single();
    if (inviteError) throw inviteError;

    const envAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const origin = req.headers.get("origin") || "";
    const isLovableGateHost = (url: string) =>
      /lovable\.dev|lovableproject\.com|id-preview--/i.test(url);
    const inferredAppUrl = origin && !isLovableGateHost(origin)
      ? origin
      : "http://localhost:8080";
    const publicAppUrl = envAppUrl && !isLovableGateHost(envAppUrl)
      ? envAppUrl
      : inferredAppUrl;

    const inviteUrl = `${publicAppUrl}/auth?invite=${inviteToken}`;

    // Write audit log (service role bypasses RLS)
    try {
      await supabase.from("audit_logs").insert({
        organization_id: org.id,
        user_id: user.id,
        action: "invite_org_admin",
        entity_type: "org_admin_invite",
        entity_id: inviteRow?.id ?? null,
        details: {
          invite_email: email,
          invite_full_name: fullName || null,
        },
        ip_address: getRequestIp(req),
      });
    } catch (e) {
      console.error("[audit_logs] failed to write org admin invite log:", e);
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { text-align: center; margin-bottom: 40px; }
          .logo { font-size: 28px; font-weight: bold; color: #ef4444; }
          .content { background: #f9fafb; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #ef4444, #f97316); color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">UltraHire</div>
          </div>
          <div class="content">
            <h2>Organization Admin Setup</h2>
            <p>${fullName ? `Hi ${fullName},` : "Hi,"}</p>
            <p>You’ve been invited to become the <strong>Org Super Admin</strong> for <strong>${org.name}</strong>.</p>
            <p>Click below to accept and set up your account:</p>
            <p style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" class="button">Complete Setup</a>
            </p>
            <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">
              Or copy and paste this link into your browser:<br />
              <a href="${inviteUrl}" style="color: #ef4444; word-break: break-all;">${inviteUrl}</a>
            </p>
            <p style="font-size: 14px; color: #6b7280;">This invitation expires in 7 days.</p>
          </div>
          <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmail(
      email,
      `You're invited to become Org Super Admin for ${org.name}`,
      emailHtml,
    );

    return new Response(
      JSON.stringify({
        success: true,
        organizationId: org.id,
        inviteToken,
        inviteUrl,
        emailDelivery: RESEND_API_KEY ? "resend" : "skipped",
        emailResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error in send-org-admin-invite function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);


