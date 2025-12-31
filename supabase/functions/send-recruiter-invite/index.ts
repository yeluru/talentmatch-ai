import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  fullName?: string;
  organizationId: string;
  organizationName: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "TalentMatch <onboarding@resend.dev>",
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

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { email, fullName, organizationId, organizationName }: InviteRequest = await req.json();

    // Generate a unique invite token
    const inviteToken = crypto.randomUUID();

    // Create the invite in the database
    const { error: insertError } = await supabase
      .from("recruiter_invites")
      .insert({
        email,
        full_name: fullName,
        organization_id: organizationId,
        invited_by: user.id,
        invite_token: inviteToken,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to create invite");
    }

    // Build the invite URL
    // IMPORTANT: Do not rely on the request Origin header here, because invites may be sent from
    // editor/preview hosts (which then redirect through an auth bridge). Use a stable app URL.
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://preview--talmatch.lovable.app";
    const inviteUrl = `${publicAppUrl}/auth?invite=${inviteToken}`;

    // Send the email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { text-align: center; margin-bottom: 40px; }
          .logo { font-size: 28px; font-weight: bold; color: #6366f1; }
          .content { background: #f9fafb; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">TalentMatch</div>
          </div>
          <div class="content">
            <h2>You're Invited! 🎉</h2>
            <p>${fullName ? `Hi ${fullName},` : 'Hi,'}</p>
            <p>You've been invited to join <strong>${organizationName}</strong> as a Recruiter on TalentMatch.</p>
            <p>Click the button below to accept the invitation and set up your account:</p>
            <p style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" class="button">Accept Invitation</a>
            </p>
            <p style="font-size: 14px; color: #6b7280;">This invitation expires in 7 days.</p>
          </div>
          <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <p>&copy; TalentMatch AI - AI-Powered Recruitment</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await sendEmail(
      email,
      `You're invited to join ${organizationName} as a Recruiter`,
      emailHtml
    );

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, inviteToken }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-recruiter-invite function:", error);
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
