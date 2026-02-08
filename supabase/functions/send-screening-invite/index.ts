import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  toEmail: string;
  subject?: string;
  body?: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  jobTitle?: string;
  candidateName?: string;
  organizationId?: string;
};

/** Format date for .ics (UTC). */
function toIcsUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/** Escape text for .ics DESCRIPTION/SUMMARY. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Build .ics file content for one event. */
function buildIcs(opts: {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  url?: string;
}): string {
  const startStr = toIcsUtc(opts.start);
  const endStr = toIcsUtc(opts.end);
  const uid = `screening-${opts.start.getTime()}@ultrahire`;
  const summary = icsEscape(opts.summary);
  const description = icsEscape(opts.description);
  const urlPart = opts.url ? `\nURL:${opts.url}` : "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UltraHire//Screening//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${startStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}${urlPart}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

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
    const scheduledAt = body?.scheduledAt ? new Date(body.scheduledAt) : null;
    const durationMinutes = Number(body?.durationMinutes) || 60;
    const meetingLink = (body?.meetingLink || "").trim() || undefined;
    const jobTitle = (body?.jobTitle || "").trim() || "Screening";
    const candidateName = (body?.candidateName || "").trim() || "Candidate";
    const organizationId = body?.organizationId ? String(body.organizationId).trim() : null;

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "Missing toEmail" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!scheduledAt || isNaN(scheduledAt.getTime())) {
      return new Response(JSON.stringify({ error: "Missing or invalid scheduledAt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
    const summary = `Screening: ${jobTitle}`;
    const description = [
      `Screening interview for ${jobTitle}.`,
      candidateName ? `Candidate: ${candidateName}.` : "",
      meetingLink ? `Join: ${meetingLink}` : "",
    ].filter(Boolean).join(" ");

    const icsContent = buildIcs({
      summary,
      description,
      start: scheduledAt,
      end: endAt,
      url: meetingLink,
    });
    const icsBytes = new TextEncoder().encode(icsContent);

    if (organizationId) {
      const svc = createClient(supabaseUrl, supabaseServiceKey);
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

    const resendApiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
    const fromRaw = (Deno.env.get("SMTP_FROM") || Deno.env.get("RESEND_FROM") || "UltraHire <no-reply@talentmatch.local>").trim();
    const fromEmail = fromRaw.includes("<") && fromRaw.includes(">") ? fromRaw : `UltraHire <${fromRaw}>`;

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not set; cannot send calendar invite" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = (body?.subject || "").trim() || `Screening interview: ${jobTitle}`;
    const bodyText = (body?.body || "").trim() || `You have been invited to a screening interview for ${jobTitle}. Please find the calendar invite attached.${meetingLink ? `\n\nJoin link: ${meetingLink}` : ""}`;
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5;">
        <p>${bodyText.replaceAll("\n", "<br/>")}</p>
        <p style="color:#6b7280;font-size:12px;">Add the attached .ics file to your calendar, or open it to add the event.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
        attachments: [{ filename: "screening-invite.ics", content: bytesToBase64(icsBytes) }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[send-screening-invite] Resend error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to send calendar invite", details: errText || `Resend ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
