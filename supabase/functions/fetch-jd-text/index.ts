import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_HTML_BYTES = 2_000_000; // 2MB
const MAX_TEXT_CHARS = 140_000;

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength);
}

function isPrivateHostnameOrIp(host: string) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1" || h === "::1") return true;
  // Block obvious private IP literals
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  const m172 = h.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function htmlToVisibleText(html: string) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br|tr|td)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[ \t\u00A0]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim().slice(0, MAX_TEXT_CHARS);
  return s;
}

function normalizeForHeuristics(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJobDescriptionText(text: string) {
  const t = normalizeForHeuristics(text);
  if (!t) return false;

  // High-signal JD headings/sections
  const jdSignals: RegExp[] = [
    /\bresponsibilit(y|ies)\b/i,
    /\bqualification(s)?\b/i,
    /\brequirement(s)?\b/i,
    /\bjob description\b/i,
    /\bwhat you('ll| will) do\b/i,
    /\bwhat you('ll| will) bring\b/i,
    /\bpreferred\b/i,
    /\bbenefits\b/i,
  ];
  const jdHits = jdSignals.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);

  // Bullet density (many JDs are bullet heavy)
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[•\-\*]\s+/.test(l) && l.length >= 12).length;

  // Require some structure: either headings or bullets.
  return jdHits >= 2 || bulletLines >= 6;
}

function looksLikeCareersLandingPage(text: string) {
  const t = normalizeForHeuristics(text);
  if (!t) return false;
  const landingSignals: RegExp[] = [
    /\border now\b/i,
    /\bdownload app\b/i,
    /\bmenu\b/i,
    /\brewards\b/i,
    /\bcatering\b/i,
    /\bgift cards?\b/i,
    /\blocations?\b/i,
    /\bfind a (cafe|store)\b/i,
    /\bown a franchise\b/i,
    /\bprivacy policy\b/i,
    /\bterms of use\b/i,
    /\bsitemap\b/i,
    /\bcareers\b/i,
    /\bcorporate opportunities\b/i,
    /\bcafe opportunities\b/i,
  ];
  const hits = landingSignals.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  // If it hits many of these and doesn't look like a JD, it's probably a nav/landing page.
  return hits >= 5;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const url = sanitizeString(body?.url, 2000);
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["http:", "https:"].includes(u.protocol)) {
      return new Response(JSON.stringify({ error: "Only http(s) URLs are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isPrivateHostnameOrIp(u.hostname)) {
      return new Response(JSON.stringify({ error: "Blocked URL host" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(u.toString(), {
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
          error: `JD fetch failed (${res.status}). If this site blocks automated access, paste the JD instead.`,
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

    if (extractedText.length < 400) {
      return new Response(
        JSON.stringify({
          error: "Fetched JD page but extracted too little readable text. Paste the JD instead.",
          extractedTextPreview: extractedText.slice(0, 300),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Heuristic guard: many "career" URLs are landing pages with navigation text, not an actual JD.
    // In those cases, "fetch succeeded" but ATS analysis becomes meaningless (tiny/boilerplate keyword set).
    if (!looksLikeJobDescriptionText(extractedText) && looksLikeCareersLandingPage(extractedText)) {
      return new Response(
        JSON.stringify({
          error:
            "Fetched page, but it does not look like a real job description (it looks like a careers/landing page). Open the actual job detail page and paste its JD text if needed.",
          extractedTextPreview: extractedText.slice(0, 400),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ extractedText, mode: "html" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg =
      e?.name === "AbortError"
        ? "JD fetch timed out. Paste the JD instead."
        : e?.message || "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

