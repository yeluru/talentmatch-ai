import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  requestId: string;
  appUrl?: string;
};

function getEnvInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

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

    const body = (await req.json()) as Body;
    const requestId = String(body?.requestId || "").trim();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "Missing requestId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for cross-user inserts + safe updates
    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // Load request + engagement context (service role)
    const { data: reqRow, error: reqErr } = await svc
      .from("candidate_engagement_requests")
      .select(
        `
        id, request_type, status, to_email, subject, body, payload,
        candidate_engagements:engagement_id (
          id, organization_id, candidate_id, job_id, stage, status,
          organizations:organization_id ( id, name ),
          jobs:job_id ( id, title ),
          candidate_profiles:candidate_id ( id, full_name, email, user_id )
        )
      `,
      )
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr) throw reqErr;
    if (!reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const engagement = (reqRow as any)?.candidate_engagements as any | null;
    const candidate = engagement?.candidate_profiles || null;
    const org = engagement?.organizations || null;
    const job = engagement?.jobs || null;

    // Authorization: only recruiters in the engagement org can send
    const { data: callerRole } = await svc
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", engagement?.organization_id)
      .in("role", ["recruiter", "account_manager", "org_admin", "super_admin"])
      .maybeSingle();
    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toEmail =
      (reqRow as any)?.to_email ||
      candidate?.email ||
      null;
    const subject = String((reqRow as any)?.subject || "").trim();
    const bodyText = String((reqRow as any)?.body || "").trim();

    if (!toEmail) throw new Error("Missing recipient email");
    if (!subject) throw new Error("Missing subject");
    if (!bodyText) throw new Error("Missing body");

    // Construct deep link to request page (candidate must login/signup; app handles redirect via ProtectedRoute)
    const appUrl = (Deno.env.get("APP_URL") || body?.appUrl || "").trim();
    const requestUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/candidate/engagements/requests/${requestId}` : null;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
        <p>${bodyText.replaceAll("\n", "<br/>")}</p>
        ${
          requestUrl
            ? `<p style="margin-top: 16px;">
                <a href="${requestUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;">
                  Review & respond
                </a>
              </p>
              <p style="color:#6b7280;font-size:12px;margin-top:10px;">
                If the button doesn't work, copy and paste this link: ${requestUrl}
              </p>`
            : ""
        }
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="color:#6b7280;font-size:12px;">
          ${org?.name ? `${org.name} via TalentMatch` : "TalentMatch"}
        </p>
      </div>
    `;

    // Send via SMTP (Mailpit by default)
    const smtpHost = (Deno.env.get("SMTP_HOST") || Deno.env.get("MAILPIT_SMTP_HOST") || "127.0.0.1").trim();
    const smtpPort = getEnvInt("SMTP_PORT", getEnvInt("MAILPIT_SMTP_PORT", 1025));
    const smtpUser = (Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = (Deno.env.get("SMTP_PASS") || "").trim();
    const smtpTls = (Deno.env.get("SMTP_TLS") || "").trim().toLowerCase() === "true";

    const fromEmail = (Deno.env.get("SMTP_FROM") || "TalentMatch <no-reply@talentmatch.local>").trim();

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpTls,
        ...(smtpUser && smtpPass ? { auth: { username: smtpUser, password: smtpPass } } : {}),
      },
    });

    try {
      await client.send({
        from: fromEmail,
        to: toEmail,
        subject,
        content: bodyText,
        html,
      });
    } finally {
      try {
        await client.close();
      } catch {
        // ignore close errors
      }
    }

    // Mark sent
    const { error: updErr } = await svc
      .from("candidate_engagement_requests")
      .update({ status: "sent", sent_at: new Date().toISOString() } as any)
      .eq("id", requestId);
    if (updErr) throw updErr;

    // Best-effort bump last activity
    try {
      await svc
        .from("candidate_engagements")
        .update({ last_activity_at: new Date().toISOString() } as any)
        .eq("id", engagement?.id);
    } catch {
      // ignore
    }

    // Best-effort in-app notification for candidates who already have accounts
    try {
      const candidateUserId = candidate?.user_id || null;
      if (candidateUserId) {
        const title = "Engagement action needed";
        const label = String(reqRow.request_type || "request").replaceAll("_", " ");
        const msg = job?.title
          ? `Please respond to ${label} for ${job.title}.`
          : `Please respond to ${label}.`;
        const link = requestUrl ? new URL(requestUrl).pathname : `/candidate/engagements/requests/${requestId}`;
        await svc.from("notifications").insert({
          user_id: candidateUserId,
          title,
          message: msg,
          type: "engagement",
          link,
        } as any);
      }
    } catch {
      // ignore notification failures
    }

    return new Response(
      JSON.stringify({
        ok: true,
        to: toEmail,
        requestId,
        engagementId: engagement?.id || null,
        candidateName: candidate?.full_name || null,
        orgName: org?.name || null,
        jobTitle: job?.title || null,
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

