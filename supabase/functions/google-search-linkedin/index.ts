import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function looksLikeGoogleApiKey(key: string): boolean {
  const k = String(key || "").trim();
  // Google API keys for Custom Search typically start with "AIza" and do not include "." characters.
  // We keep this check intentionally lightweight to avoid false negatives.
  if (!k) return false;
  if (!k.startsWith("AIza")) return false;
  if (k.includes(".")) return false;
  return k.length >= 25;
}

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

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(Math.trunc(v), max));
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
  country: "us" | "any";
}): Promise<any> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", args.apiKey);
  url.searchParams.set("cx", args.cx);
  url.searchParams.set("q", args.q);
  url.searchParams.set("num", String(args.num));
  url.searchParams.set("start", String(args.start));
  // Stronger US-only behavior than adding terms in the query:
  // - cr restricts results to pages from a given country (best-effort).
  // - gl boosts results from a given country.
  if (args.country === "us") {
    url.searchParams.set("cr", "countryUS");
    url.searchParams.set("gl", "us");
  }

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Google CSE error:", resp.status, t);
    // Try to surface a more actionable message to the UI.
    try {
      const parsed = JSON.parse(t);
      const rawMsg =
        parsed?.error?.message ||
        parsed?.message ||
        `Google CSE error ${resp.status}`;

      // 2026+ reality: Custom Search JSON API is closed to new customers.
      // When a project isn't provisioned/grandfathered, Google returns:
      // "This project does not have the access to Custom Search JSON API."
      const msgLower = String(rawMsg || "").toLowerCase();
      if (resp.status === 403 && msgLower.includes("does not have the access to custom search json api")) {
        throw new Error(
          "403: This Google Cloud project is not provisioned for Custom Search JSON API " +
            "(Google has closed the API to new customers). " +
            "Use an existing grandfathered project/API key, or migrate to an alternative. " +
            "See: https://developers.google.com/custom-search/v1/overview",
        );
      }

      throw new Error(`${resp.status}: ${rawMsg}`);
    } catch {
      const ct = resp.headers.get("content-type") || "";
      const snippet = String(t || "").slice(0, 280).replace(/\s+/g, " ").trim();
      throw new Error(`Search failed: ${resp.status} (${ct}) ${snippet}`);
    }
  }
  return await resp.json();
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

    const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY");
    const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX");
    if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
      return new Response(JSON.stringify({
        success: false,
        error: "GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX are not configured for Edge Functions.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const keySuffix = GOOGLE_CSE_API_KEY.slice(-4);
    const keyPrefix = GOOGLE_CSE_API_KEY.slice(0, 4);
    const keyLooksValid = looksLikeGoogleApiKey(GOOGLE_CSE_API_KEY);

    if (!keyLooksValid) {
      return new Response(JSON.stringify({
        success: false,
        error:
          "GOOGLE_CSE_API_KEY does not look like a Google API key for Custom Search JSON API. " +
          "Expected a key that starts with 'AIza' (from Google Cloud Console → APIs & Services → Credentials).",
        debug: {
          key_prefix: keyPrefix,
          key_suffix: keySuffix,
          key_len: GOOGLE_CSE_API_KEY.length,
          cx_suffix: GOOGLE_CSE_CX.slice(-6),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const capped = clampInt(limit, 1, 50, 20);
    // Google "start" is 1-based index into the result set.
    // Hard constraint: start + num - 1 <= 100 (deep paging limit).
    const startFrom = clampInt(body?.start, 1, 100, 1);
    const normalizedCountry = String(country || "us").toLowerCase() === "us" ? "us" : "any";
    const built = buildXrayQuery(rawQuery, normalizedCountry);
    const finalXray = rawXray ? rawXray.replace(/\s+/g, " ").trim() : built;
    // Google CSE returns max 10 results per request. Paginate to fill `capped`.
    const pageSize = Math.min(10, capped);
    const maxStartForPageSize = Math.max(1, 100 - pageSize + 1); // ensures start+pageSize-1 <= 100
    const pages = Math.ceil(capped / pageSize);

    let totalResults = 0;
    const items: any[] = [];
    try {
      const initialStart = Math.max(1, Math.min(startFrom, maxStartForPageSize));
      let reachedEnd = false;
      let lastPageStart = 0;
      for (let p = 0; p < pages; p++) {
        const start = initialStart + p * pageSize; // 1, 11, 21... (or offset based)
        if (start > maxStartForPageSize) break; // would violate deep paging constraint
        const data = await fetchGoogleCsePage({
          apiKey: GOOGLE_CSE_API_KEY,
          cx: GOOGLE_CSE_CX,
          q: finalXray,
          start,
          num: pageSize,
          country: normalizedCountry,
        });
        if (p === 0) {
          totalResults = Number(data?.searchInformation?.totalResults || 0) || 0;
        }
        const pageItems = Array.isArray(data?.items) ? data.items : [];
        items.push(...pageItems);
        lastPageStart = start;
        if (pageItems.length < pageSize) {
          reachedEnd = true;
          break; // no more pages
        }
      }

      // If we hit the deep paging limit or result set end, signal "no more" by returning next_start=0
      // (keeps the UI from trying to load beyond what Google allows).
      if (reachedEnd || !lastPageStart || (lastPageStart + pageSize) > maxStartForPageSize) {
        (body as any).__next_start_override = 0;
      } else {
        (body as any).__next_start_override = lastPageStart + pageSize;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Search failed";
      return new Response(JSON.stringify({
        success: false,
        error: msg,
        xray: finalXray,
        debug: {
          key_prefix: keyPrefix,
          key_suffix: keySuffix,
          cx_suffix: GOOGLE_CSE_CX.slice(-6),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const returned = results.length;
    const next_start =
      typeof (body as any)?.__next_start_override === "number"
        ? (body as any).__next_start_override
        : 0;

    return new Response(JSON.stringify({
      success: true,
      xray: finalXray,
      results,
      returned,
      start: Math.max(1, Math.min(startFrom, maxStartForPageSize)),
      next_start,
      // `total_found` is Google's estimated total results; API deep paging is limited to ~100.
      total_found: totalResults,
      estimated_total: totalResults,
      max_accessible: 100
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

