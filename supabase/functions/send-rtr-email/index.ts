import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { join, fromFileUrl } from "https://deno.land/std@0.190.0/path/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  toEmail: string;
  subject: string;
  body: string;
  rate: string;
  organizationId?: string;
};

function getEnvInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Decode base64 to Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Load RTR template: RTR_TEMPLATE_BASE64 env, then RTR_TEMPLATE_URL, then bundled template_b64.ts, then file paths. */
async function loadRtrTemplate(): Promise<Uint8Array> {
  const b64Env = (Deno.env.get("RTR_TEMPLATE_BASE64") || "").trim();
  if (b64Env) {
    try {
      return base64ToBytes(b64Env);
    } catch (e) {
      console.error("RTR_TEMPLATE_BASE64 decode error:", e);
      throw new Error("Invalid RTR_TEMPLATE_BASE64");
    }
  }
  const url = (Deno.env.get("RTR_TEMPLATE_URL") || "").trim();
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch RTR template: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  try {
    const { RTR_TEMPLATE_BASE64 } = await import("./template_b64.ts");
    if (RTR_TEMPLATE_BASE64) return base64ToBytes(RTR_TEMPLATE_BASE64);
  } catch (e) {
    console.error("Bundled template_b64 import error:", e);
  }
  const pathEnv = (Deno.env.get("RTR_TEMPLATE_PATH") || "").trim();
  if (pathEnv) {
    try {
      return await Deno.readFile(pathEnv);
    } catch (e) {
      console.error("RTR_TEMPLATE_PATH read error:", e);
    }
  }
  const candidates: string[] = [];
  try {
    const dir = fromFileUrl(new URL(".", import.meta.url));
    candidates.push(join(dir, "RTR_template.pdf"));
  } catch {
    // ignore
  }
  const cwd = Deno.cwd();
  candidates.push(
    "RTR_template.pdf",
    "./RTR_template.pdf",
    join(cwd, "RTR_template.pdf"),
    join(cwd, "send-rtr-email", "RTR_template.pdf"),
    join(cwd, "supabase", "functions", "send-rtr-email", "RTR_template.pdf")
  );
  for (const p of candidates) {
    try {
      return await Deno.readFile(p);
    } catch {
      continue;
    }
  }
  throw new Error(
    "RTR template not found. Use RTR_template.pdf in this directory (bundled as template_b64.ts), or set RTR_TEMPLATE_URL / RTR_TEMPLATE_BASE64."
  );
}

/** Fill the rate field in the PDF form and return the filled PDF bytes. */
async function fillRtrPdf(templateBytes: Uint8Array, rate: string, rateFieldName: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const fieldNames = fields.map((f) => f.getName());
  const toTry = [rateFieldName, "rate_per_hour", "Rate", "rate", "Pay Rate", "pay_rate", ...fieldNames];
  const seen = new Set<string>();
  let filled = false;
  for (const name of toTry) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    try {
      const field = form.getTextField(name);
      field.setText(String(rate).trim());
      filled = true;
      break;
    } catch {
      continue;
    }
  }
  if (!filled) {
    throw new Error(
      `Could not find a text field to set rate. Template has fields: ${fieldNames.join(", ") || "none"}. Set RTR_RATE_FIELD_NAME to match your PDF field name.`
    );
  }
  form.flatten();
  return pdfDoc.save();
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
    const toEmail = String(body?.toEmail || "").trim().toLowerCase();
    const subject = String(body?.subject || "").trim();
    const bodyText = String(body?.body || "").trim();
    const rate = String(body?.rate ?? "").trim();
    const organizationId = body?.organizationId ? String(body.organizationId).trim() : null;

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "Missing toEmail" }), {
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
    if (!rate) {
      return new Response(JSON.stringify({ error: "Missing rate" }), {
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

    const rateFieldName = (Deno.env.get("RTR_RATE_FIELD_NAME") || "").trim() || "rate";
    const templateBytes = await loadRtrTemplate();
    const filledPdfBytes = await fillRtrPdf(templateBytes, rate, rateFieldName);

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
    const fromEmail = (Deno.env.get("SMTP_FROM") || "UltraHire <no-reply@talentmatch.local>").trim();

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpTls,
        ...(smtpUser && smtpPass ? { auth: { username: smtpUser, password: smtpPass } } : {}),
      },
    });

    const attachment = {
      contentType: "application/pdf",
      filename: "RTR.pdf",
      content: filledPdfBytes,
      encoding: "binary" as const,
    };

    try {
      await client.send({
        from: fromEmail,
        to: toEmail,
        subject,
        content: bodyText,
        html,
        attachments: [attachment],
      });
    } catch (smtpErr: unknown) {
      const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      const isConnectionRefused =
        msg.includes("ECONNREFUSED") || msg.toLowerCase().includes("connection refused") || msg.includes("os error 111");
      const skipSmtpDev = (Deno.env.get("SKIP_SMTP_DEV") || "").trim().toLowerCase() === "true";
      if (skipSmtpDev && isConnectionRefused) {
        console.log("[send-rtr-email] SKIP_SMTP_DEV: skipping send (no SMTP). Would have sent RTR to", toEmail);
        return new Response(
          JSON.stringify({ ok: true, to: toEmail, skipped: true }),
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
      JSON.stringify({ ok: true, to: toEmail }),
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
