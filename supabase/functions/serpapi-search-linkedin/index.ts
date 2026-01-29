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
    return `https://www.linkedin.com${path}`;
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

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(Math.trunc(v), max));
}

async function fetchSerpApiPage(args: {
  apiKey: string;
  q: string;
  start: number; // 0-based offset
  country: "us" | "any";
}): Promise<any> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("api_key", args.apiKey);
  url.searchParams.set("q", args.q);
  url.searchParams.set("start", String(Math.max(0, Math.trunc(args.start || 0))));
  url.searchParams.set("google_domain", "google.com");
  url.searchParams.set("hl", "en");
  url.searchParams.set("device", "desktop");
  // Stronger US-only behavior than adding terms in the query:
  // - cr restricts results to pages from a given country (best-effort).
  // - gl boosts results from a given country.
  if (args.country === "us") {
    url.searchParams.set("cr", "countryUS");
    url.searchParams.set("gl", "us");
  }

  const resp = await fetch(url.toString());
  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!resp.ok) {
    const msg = data?.error || data?.search_metadata?.error || `SerpAPI error ${resp.status}`;
    console.error("SerpAPI HTTP error:", resp.status, msg);
    throw new Error(`${resp.status}: ${String(msg || "").slice(0, 300)}`);
  }

  const status = String(data?.search_metadata?.status || "").toLowerCase();
  if (status === "error") {
    const msg = data?.error || data?.search_metadata?.error || "SerpAPI search failed";
    console.error("SerpAPI search status error:", msg);
    throw new Error(String(msg || "SerpAPI search failed"));
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Search can be allowed without auth (verify_jwt=false); saving leads still requires auth via RLS.
    // If Authorization is missing/invalid, we'll still return search results.
    if (authHeader) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        await supabase.auth.getUser(); // warm auth; ignore failures
      } catch {
        // ignore
      }
    }

    const body = await req.json();
    const { query, xray, limit = 20, country = "us" } = body ?? {};
    const rawQuery = String(query || "").trim();
    const rawXray = typeof xray === "string" ? String(xray).trim() : "";
    if (!rawQuery && !rawXray) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SERPAPI_API_KEY = Deno.env.get("SERPAPI_API_KEY");
    if (!SERPAPI_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: "SERPAPI_API_KEY is not configured for Edge Functions.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedCountry = String(country || "us").toLowerCase() === "us" ? "us" : "any";
    const capped = clampInt(limit, 1, 50, 20);
    // Keep the same contract as google-search-linkedin:
    // - request start is 1-based (first page start=1)
    // - response next_start is 1-based, or 0 when exhausted
    const startFrom = clampInt(body?.start, 1, 1_000_000, 1);
    const finalXray = rawXray
      ? rawXray.replace(/\s+/g, " ").trim()
      : buildXrayQuery(rawQuery, normalizedCountry);

    // SerpAPI (Google engine) paginates by 0-based `start` in multiples of 10.
    const serpStartBase = Math.max(0, startFrom - 1);
    const pageSize = 10;
    const pages = Math.ceil(capped / pageSize);

    let totalResults = 0;
    const items: any[] = [];
    let reachedEnd = false;
    let lastPageStart = serpStartBase;

    for (let p = 0; p < pages; p++) {
      const start = serpStartBase + p * pageSize;
      const data = await fetchSerpApiPage({
        apiKey: SERPAPI_API_KEY,
        q: finalXray,
        start,
        country: normalizedCountry,
      });
      if (p === 0) {
        totalResults = Number(data?.search_information?.total_results || 0) || 0;
      }
      const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
      items.push(...organic);
      lastPageStart = start;
      if (organic.length < pageSize) {
        reachedEnd = true;
        break;
      }
    }

    const dedup = new Map<string, any>();
    for (const item of items) {
      const link = String(item?.link || "");
      const canonical = canonicalizeLinkedInInUrl(link);
      if (!canonical) continue;
      if (dedup.has(canonical)) continue;
      const title = String(item?.title || "");
      const snippet = String(item?.snippet || "");
      dedup.set(canonical, {
        linkedin_url: canonical,
        source_url: canonical,
        title,
        snippet,
        match_score: 0,
        matched_terms: [],
        raw_result: item,
      });
    }

    const results = Array.from(dedup.values()).slice(0, capped);
    const returned = results.length;

    // If we got fewer than pageSize on the last fetch, treat as exhausted.
    const next_start =
      reachedEnd ? 0 : Math.max(0, Math.trunc(lastPageStart + pageSize + 1)); // back to 1-based

    return new Response(JSON.stringify({
      success: true,
      xray: finalXray,
      results,
      returned,
      start: startFrom,
      next_start,
      total_found: totalResults,
      estimated_total: totalResults,
      // SerpAPI can paginate deeper than Google CSE's 100-result cap.
      // Actual accessible results still depend on Google's own paging behavior.
      max_accessible: 450,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

