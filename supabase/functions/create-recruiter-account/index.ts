import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateAccountRequest {
  email: string;
  fullName: string;
  tempPassword: string;
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

    // Verify the user is a manager
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is an account manager
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("role", "account_manager")
      .single();

    if (!roles) {
      throw new Error("Only account managers can create recruiter accounts");
    }

    const { email, fullName, tempPassword, organizationId, organizationName }: CreateAccountRequest = await req.json();

    // Verify the organization matches
    if (roles.organization_id !== organizationId) {
      throw new Error("Organization mismatch");
    }

    // Create the user account with admin API
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (createError) {
      console.error("Create user error:", createError);
      throw new Error(createError.message);
    }

    // Create profile for new user
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        user_id: newUser.user.id,
        email,
        full_name: fullName,
      });

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    // Assign recruiter role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "recruiter",
        organization_id: organizationId,
      });

    if (roleError) {
      console.error("Role error:", roleError);
      throw new Error("Failed to assign recruiter role");
    }

    // Send welcome email with credentials
    const baseUrl = req.headers.get("origin") || "https://talentmatch.lovable.app";
    const loginUrl = `${baseUrl}/auth`;

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
          .credentials { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .cred-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
          .cred-value { font-family: monospace; font-size: 16px; font-weight: 600; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; font-size: 14px; }
          .footer { text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">TalentMatch</div>
          </div>
          <div class="content">
            <h2>Welcome to the Team! 🎉</h2>
            <p>Hi ${fullName},</p>
            <p>Your account has been created at <strong>${organizationName}</strong>. You're now a Recruiter on TalentMatch!</p>
            
            <div class="credentials">
              <div style="margin-bottom: 16px;">
                <div class="cred-label">Email</div>
                <div class="cred-value">${email}</div>
              </div>
              <div>
                <div class="cred-label">Temporary Password</div>
                <div class="cred-value">${tempPassword}</div>
              </div>
            </div>
            
            <div class="warning">
              ⚠️ Please change your password immediately after logging in.
            </div>
            
            <p style="text-align: center; margin: 32px 0;">
              <a href="${loginUrl}" class="button">Sign In Now</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; TalentMatch AI - AI-Powered Recruitment</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(
      email,
      `Welcome to ${organizationName} - Your TalentMatch Account`,
      emailHtml
    );

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in create-recruiter-account function:", error);
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
