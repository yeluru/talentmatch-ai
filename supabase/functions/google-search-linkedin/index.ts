import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function canonicalizeLinkedInInUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes("linkedin.com")) return null;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path.toLowerCase().startsWith("/in/")) return null;
    const canonical = `https://www.linkedin.com${path}`;
    return canonical;
  } catch {
    return null;
  }
}

function buildXrayQuery(raw: string, country: "us" | "any" = "us"): string {
  const q = String(raw || "").trim();
  const base = `site:linkedin.com/in ${q}`;
  const seniorityHints = `("5 years" OR "5+ years" OR "6 years" OR senior OR lead OR staff OR principal)`;
  const exclude = `-recruiter -staffing -talent -sales -job -jobs -hiring -career`;
  const us = country === "us" ? `("United States" OR USA OR "U.S." OR US)` : "";
  return `${base} ${us} ${seniorityHints} ${exclude}`.trim().replace(/\s+/g, " ");
}

function scoreSnippet(text: string): number {
  const t = String(text || "").toLowerCase();
  let s = 0;
  const plus2 = ["python", "aws"];
  const plus1 = ["lambda", "ecs", "eks", "dynamodb", "s3", "fastapi", "django", "flask"];
  const minus3 = ["recruiter", "talent acquisition", "staffing", "hiring"];
  for (const k of plus2) if (t.includes(k)) s += 2;
  for (const k of plus1) if (t.includes(k)) s += 1;
  for (const k of minus3) if (t.includes(k)) s -= 3;
  if (/\b\d\+?\s*years\b/.test(t)) s += 1;
  return s;
}

async function fetchGoogleCsePage(args: {
  apiKey: string;
  cx: string;
  q: string;
  start: number;
  num: number;
}): Promise<any> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", args.apiKey);
  url.searchParams.set("cx", args.cx);
  url.searchParams.set("q", args.q);
  url.searchParams.set("num", String(args.num));
  url.searchParams.set("start", String(args.start));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Google CSE error:", resp.status, t);
    throw new Error(`Search failed: ${resp.status}`);
  }
  return await resp.json();
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, limit = 20, country = "us" } = await req.json();
    const rawQuery = String(query || "").trim();
    if (!rawQuery) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
    const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX");
    if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
      throw new Error("GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX are not configured.");
    }

    const capped = Math.max(1, Math.min(Number(limit) || 20, 50));
    const xray = buildXrayQuery(rawQuery, String(country || "us").toLowerCase() === "us" ? "us" : "any");
    // Google CSE returns max 10 results per request. Paginate to fill `capped`.
    const pageSize = Math.min(10, capped);
    const pages = Math.ceil(capped / pageSize);

    let totalResults = 0;
    const items: any[] = [];
    for (let p = 0; p < pages; p++) {
      const start = 1 + p * pageSize; // 1, 11, 21...
      const data = await fetchGoogleCsePage({
        apiKey: GOOGLE_CSE_API_KEY,
        cx: GOOGLE_CSE_CX,
        q: xray,
        start,
        num: pageSize,
      });
      if (p === 0) {
        totalResults = Number(data?.searchInformation?.totalResults || 0) || 0;
      }
      const pageItems = Array.isArray(data?.items) ? data.items : [];
      items.push(...pageItems);
      if (pageItems.length < pageSize) break; // no more pages
    }

    const dedup = new Map<string, any>();
    for (const item of items) {
      const link = String(item?.link || "");
      const canonical = canonicalizeLinkedInInUrl(link);
      if (!canonical) continue;
      if (dedup.has(canonical)) continue;
      const title = String(item?.title || "");
      const snippet = String(item?.snippet || "");
      const score = scoreSnippet(`${title} ${snippet}`);
      dedup.set(canonical, {
        linkedin_url: canonical,
        source_url: canonical,
        title,
        snippet,
        match_score: score,
        matched_terms: [],
        raw_result: item,
      });
    }

    const results = Array.from(dedup.values())
      .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
      .slice(0, capped);

    return new Response(JSON.stringify({ success: true, xray, results, total_found: totalResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

