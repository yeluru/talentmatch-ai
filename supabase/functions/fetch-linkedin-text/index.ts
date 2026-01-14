import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_HTML_BYTES = 1_500_000; // 1.5MB
const MAX_TEXT_CHARS = 120_000;

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength);
}

function isAllowedLinkedInUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("linkedin.com")) return false;
    // Limit scope to public profile paths; avoid arbitrary LinkedIn pages.
    return u.pathname.toLowerCase().startsWith("/in/");
  } catch {
    return false;
  }
}

function htmlToVisibleText(html: string) {
  let s = String(html || "");
  // Remove scripts/styles/noscript/svg
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // Add newlines for block-ish tags to preserve some structure
  s = s.replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // Decode minimal entities
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");

  // Collapse whitespace
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[ \t\u00A0]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim().slice(0, MAX_TEXT_CHARS);
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const url = sanitizeString(body?.url, 1000);
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isAllowedLinkedInUrl(url)) {
      return new Response(JSON.stringify({ error: "Only LinkedIn public profile URLs like https://www.linkedin.com/in/<handle>/ are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Best-effort fetch. LinkedIn may block automated requests; we return a clear error in that case.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(t);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `LinkedIn fetch failed (${res.status}). LinkedIn often blocks automated access. Please paste LinkedIn text instead.`,
          details: text.slice(0, 400),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const html = await res.text();
      const extractedText = htmlToVisibleText(html);
      return new Response(JSON.stringify({ extractedText, mode: "html" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bounded read
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_HTML_BYTES) break;
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    const extractedText = htmlToVisibleText(html);

    // Detect common block pages
    const lower = extractedText.toLowerCase();
    if (
      lower.includes("unusual activity") ||
      lower.includes("verify") && lower.includes("captcha") ||
      lower.includes("sign in") && lower.includes("join now")
    ) {
      return new Response(
        JSON.stringify({
          error: "LinkedIn blocked automated access (login/captcha). Please paste LinkedIn text instead.",
          extractedTextPreview: extractedText.slice(0, 400),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ extractedText, mode: "html" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "LinkedIn fetch timed out. Please paste LinkedIn text instead." : (e?.message || "Unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

