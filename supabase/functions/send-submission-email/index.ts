import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  toEmails: string[];
  subject: string;
  body: string;
  organizationId?: string;
  candidateId: string;
};

function getEnvInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Extract storage object path from resume file_url (full URL or path). */
function resumesObjectPath(fileUrlOrPath: string | null | undefined): string | null {
  if (!fileUrlOrPath) return null;
  const raw = String(fileUrlOrPath);
  const marker = "/resumes/";
  const idx = raw.indexOf(marker);
  if (idx >= 0) return raw.slice(idx + marker.length).split("?")[0] || null;
  if (raw.startsWith("resumes/")) return raw.slice("resumes/".length).split("?")[0] || null;
  return raw.split("?")[0] || null;
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

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const toEmails = Array.isArray(body?.toEmails)
      ? (body.toEmails as string[]).map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];
    const subject = String(body?.subject || "").trim();
    const bodyText = String(body?.body || "").trim();
    const organizationId = body?.organizationId ? String(body.organizationId).trim() : null;
    const candidateId = body?.candidateId ? String(body.candidateId).trim() : null;

    if (toEmails.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or empty toEmails" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "Missing subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!bodyText) {
      return new Response(JSON.stringify({ error: "Missing body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!candidateId) {
      return new Response(JSON.stringify({ error: "Missing candidateId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    if (organizationId) {
      const { data: role } = await svc
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .in("role", ["recruiter", "account_manager", "org_admin", "super_admin"])
        .maybeSingle();
      if (!role) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let attachment: { contentType: string; filename: string; content: Uint8Array; encoding: "binary" } | null = null;
    const { data: resumeRow } = await svc
      .from("resumes")
      .select("file_url, file_name")
      .eq("candidate_id", candidateId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeRow?.file_url) {
      const objectPath = resumesObjectPath(resumeRow.file_url);
      if (objectPath) {
        const { data: fileData, error: dlErr } = await svc.storage.from("resumes").download(objectPath);
        if (!dlErr && fileData) {
          const bytes = new Uint8Array(await fileData.arrayBuffer());
          const baseName = (resumeRow.file_name || "resume").replace(/[^a-zA-Z0-9._-]/g, "_");
          const ext = baseName.toLowerCase().endsWith(".pdf") ? "" : ".pdf";
          attachment = {
            contentType: "application/pdf",
            filename: baseName.endsWith(".pdf") ? baseName : baseName + ext,
            content: bytes,
            encoding: "binary",
          };
        }
      }
    }

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
        <p>${bodyText.replaceAll("\n", "<br/>")}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="color:#6b7280;font-size:12px;">UltraHire</p>
      </div>
    `;

    const smtpHost = (Deno.env.get("SMTP_HOST") || Deno.env.get("MAILPIT_SMTP_HOST") || "127.0.0.1").trim();
    const smtpPort = getEnvInt("SMTP_PORT", getEnvInt("MAILPIT_SMTP_PORT", 1025));
    const smtpUser = (Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = (Deno.env.get("SMTP_PASS") || "").trim();
    const smtpTls = (Deno.env.get("SMTP_TLS") || "").trim().toLowerCase() === "true";
    const fromRaw = (Deno.env.get("SMTP_FROM") || "UltraHire <no-reply@talentmatch.local>").trim();
    const fromEmail = fromRaw.includes("<") && fromRaw.includes(">") ? fromRaw : `UltraHire <${fromRaw}>`;

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpTls,
        ...(smtpUser && smtpPass ? { auth: { username: smtpUser, password: smtpPass } } : {}),
      },
    });

    const attachments = attachment ? [attachment] : [];

    try {
      await client.send({
        from: fromEmail,
        to: toEmails.join(", "),
        subject,
        content: bodyText,
        html,
        attachments,
      });
    } catch (smtpErr: unknown) {
      const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      const isConnectionRefused =
        msg.includes("ECONNREFUSED") || msg.toLowerCase().includes("connection refused") || msg.includes("os error 111");
      const skipSmtpDev = (Deno.env.get("SKIP_SMTP_DEV") || "").trim().toLowerCase() === "true";
      if (skipSmtpDev && isConnectionRefused) {
        console.log("[send-submission-email] SKIP_SMTP_DEV: skipping send. Would have sent to", toEmails.join(", "));
        return new Response(
          JSON.stringify({ ok: true, to: toEmails, skipped: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: isConnectionRefused
            ? "SMTP not reachable. Start Mailpit or set SKIP_SMTP_DEV=true for dev."
            : msg,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    return new Response(
      JSON.stringify({ ok: true, to: toEmails, attachmentIncluded: !!attachment }),
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
