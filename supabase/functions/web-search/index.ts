import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FirecrawlItem = {
  url?: string;
  title?: string;
  markdown?: string;
};

async function firecrawlSearch(args: {
  apiKey: string;
  query: string;
  limit: number;
  country: string;
  timeoutMs?: number;
}): Promise<{ success: boolean; data: FirecrawlItem[] }> {
  const { apiKey, query, limit, country, timeoutMs = 12000 } = args;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const resp = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit,
      lang: "en",
      country,
      scrapeOptions: { formats: ["markdown"] },
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error("Firecrawl search error:", resp.status, errorText);
    throw new Error(`Search failed: ${resp.status}`);
  }

  const json = await resp.json();
  const data = Array.isArray(json?.data) ? (json.data as FirecrawlItem[]) : [];
  return { success: Boolean(json?.success), data };
}

function msLeft(deadlineMs: number) {
  return deadlineMs - Date.now();
}

async function settledInBatches<T>(
  items: Array<() => Promise<T>>,
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize).map((fn) => fn());
    const settled = await Promise.allSettled(batch);
    out.push(...settled);
  }
  return out;
}

function extractEmails(text: string): string[] {
  const raw = String(text || "");
  const matches =
    raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const e = m.trim().toLowerCase();
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out.slice(0, 10);
}

function isLikelyLinkedInProfileUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return u.includes("linkedin.com/in/");
}

function isLikelyGitHubProfileUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return u.startsWith("https://github.com/") && !u.includes("/search");
}

function guessNameFromTitleOrUrl(title: string, url: string): string {
  const t = String(title || "").trim();
  if (t) {
    const cleaned = t
      .replace(/\s*\|\s*LinkedIn\s*$/i, "")
      .split(" - ")[0]
      .split(" | ")[0]
      .trim();
    if (cleaned) return cleaned.slice(0, 80);
  }
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() || "";
    const base = seg.replace(/[-_]+/g, " ").trim();
    return base ? base.slice(0, 80) : "Unknown";
  } catch {
    return "Unknown";
  }
}

function cleanExcerpt(url: string, markdown: string): string {
  const u = String(url || "").toLowerCase();
  let text = String(markdown || "").replace(/\s+/g, " ").trim();
  if (u.startsWith("https://github.com/")) {
    const patterns = [
      /skip to content/gi,
      /you signed in with another tab or window\.[^\.]*\./gi,
      /you signed out in another tab or window\.[^\.]*\./gi,
      /you switched accounts on another tab or window\.[^\.]*\./gi,
      /reload to refresh your session\.?/gi,
      /dismiss alert/gi,
      /\{\{\s*message\s*\}\}/g,
    ];
    for (const p of patterns) text = text.replace(p, " ");
    text = text.replace(/\s+/g, " ").trim();
  }
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startedAt = Date.now();
    const deadlineMs = startedAt + 55_000;

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["recruiter", "account_manager"]);

    if (!userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Forbidden - requires recruiter or manager role" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const {
      query,
      limit = 20,
      country = "us",
      includeLinkedIn = false,
      excludeUrls = [],
      strategyIndex = 0,
    } = body ?? {};

    const rawQuery = String(query || "").trim();
    if (!rawQuery) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured.");
    }

    const cappedLimit = Math.max(1, Math.min(Number(limit) || 20, 20)); // hard cap 20 per page
    const fcCountry = String(country || "us").toLowerCase();
    const baseConstraint = includeLinkedIn ? "" : " -site:linkedin.com";

    const queriesToTry: string[] = [
      `${rawQuery} (resume OR cv OR portfolio OR github OR "about me")${baseConstraint}`,
      `${rawQuery}${baseConstraint}`,
      `site:github.com ${rawQuery}${baseConstraint}`,
    ];
    const rotateBy =
      Math.max(0, Math.min(Number(strategyIndex) || 0, 1000)) %
      Math.max(1, queriesToTry.length);
    const rotatedQueries = queriesToTry
      .slice(rotateBy)
      .concat(queriesToTry.slice(0, rotateBy));

    const excluded = new Set<string>(
      Array.isArray(excludeUrls)
        ? excludeUrls.map((u: any) => String(u || "").trim()).filter(Boolean)
        : [],
    );

    const debug = {
      country: fcCountry,
      includeLinkedIn: Boolean(includeLinkedIn),
      strategy_index: rotateBy,
      excluded_urls: excluded.size,
      queries_tried: [] as { query: string; results: number; added: number; error?: string }[],
      firecrawl_merged: { unique_urls: 0, used: 0, max_unique_target: cappedLimit },
      extracted_attempted: 0,
      extracted_ok: 0,
    };

    // Build a richer strategy set so repeated "Load more" calls can find new URLs.
    // Note: this is not true cursor pagination; it's iterative discovery + excludeUrls.
    const strategyTemplates: string[] = [
      `${rawQuery} (resume OR cv OR portfolio OR github OR "about me")${baseConstraint}`,
      `${rawQuery} (portfolio OR github OR "personal website" OR "about")${baseConstraint}`,
      `${rawQuery} (site:github.com OR site:gitlab.com)${baseConstraint}`,
      `${rawQuery} site:github.com (python OR aws OR fastapi OR django OR flask)${baseConstraint}`,
      `${rawQuery} (site:dev.to OR site:medium.com OR site:substack.com) (python OR aws)${baseConstraint}`,
      `${rawQuery}${baseConstraint}`,
    ];
    const rotateBy2 =
      Math.max(0, Math.min(Number(strategyIndex) || 0, 10_000)) %
      Math.max(1, strategyTemplates.length);
    const rotatedStrategies = strategyTemplates
      .slice(rotateBy2)
      .concat(strategyTemplates.slice(0, rotateBy2));

    // Aggregate across variants; keep trying until we fill 20 unique URLs or run out of time.
    const dedup = new Map<string, FirecrawlItem>();
    const maxFetches = 6;
    const perFetchLimit = 20; // Firecrawl-side; we still return max 20 unique to UI
    for (const q of rotatedStrategies) {
      if (dedup.size >= cappedLimit) break;
      if (debug.queries_tried.length >= maxFetches) break;
      if (msLeft(deadlineMs) < 18_000) break;

      try {
        const out = await firecrawlSearch({
          apiKey: FIRECRAWL_API_KEY,
          query: q,
          limit: perFetchLimit,
          country: fcCountry,
          timeoutMs: Math.min(12_000, Math.max(4_000, msLeft(deadlineMs) - 4_000)),
        });

        let added = 0;
        if (out.success && out.data.length > 0) {
          for (const item of out.data) {
            const url = String(item?.url || "").trim();
            if (!url) continue;
            if (excluded.has(url)) continue;
            if (dedup.has(url)) continue;
            dedup.set(url, item);
            added++;
            if (dedup.size >= cappedLimit) break;
          }
        }

        debug.queries_tried.push({ query: q, results: out.data.length, added });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debug.queries_tried.push({ query: q, results: 0, added: 0, error: msg });
      }
    }

    const results = Array.from(dedup.values()).slice(0, cappedLimit);
    debug.firecrawl_merged = { unique_urls: dedup.size, used: results.length };

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          profiles: [],
          total_found: 0,
          message: "No profiles found. Try different search terms.",
          debug,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Base profiles for all results (fast)
    const baseProfiles = results.map((r) => {
      const url = String(r?.url || "").trim();
      const title = String(r?.title || "").trim();
      const markdown = String(r?.markdown || "");
      const excerpt = cleanExcerpt(url, markdown).slice(0, 600);
      return {
        full_name: guessNameFromTitleOrUrl(title, url),
        headline: title || null,
        current_company: null,
        location: null,
        skills: [],
        experience_years: null,
        summary: null,
        email: null,
        linkedin_url: isLikelyLinkedInProfileUrl(url) ? url : null,
        github_url: isLikelyGitHubProfileUrl(url) ? url : null,
        website: !isLikelyLinkedInProfileUrl(url) && !isLikelyGitHubProfileUrl(url) ? url : null,
        source_url: url,
        source_title: title || null,
        source_excerpt: excerpt || null,
        source: "web_search",
      };
    });

    // Enrich a subset with LLM extraction (for details), but do NOT filter results with the LLM.
    const extractCap = Math.min(10, results.length);
    debug.extracted_attempted = extractCap;

    const tasks: Array<() => Promise<any | null>> = results.slice(0, extractCap).map((r) => async () => {
      if (msLeft(deadlineMs) < 8_000) return null;
      const url = String(r?.url || "").trim();
      const title = String(r?.title || "").trim();
      const markdown = String(r?.markdown || "");
      if (!url || !markdown || markdown.length < 200) return null;

      const observedEmails = extractEmails(markdown);

      try {
        const { res } = await callChatCompletions({
          messages: [
            {
              role: "system",
              content:
                `Extract candidate profile information from public web pages.
Return best-effort structured data. If unknown, return null. Do not hallucinate emails.`,
            },
            {
              role: "user",
              content: `URL: ${url}\nTitle: ${title}\n\nContent:\n${markdown.substring(0, 15000)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_profile",
                parameters: {
                  type: "object",
                  properties: {
                    full_name: { type: "string" },
                    headline: { type: "string" },
                    current_company: { type: "string" },
                    location: { type: "string" },
                    skills: { type: "array", items: { type: "string" } },
                    experience_years: { type: "number" },
                    summary: { type: "string" },
                    email: { type: "string" },
                    linkedin_url: { type: "string" },
                    github_url: { type: "string" },
                    website: { type: "string" },
                  },
                  required: ["full_name"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_profile" } },
          timeoutMs: Math.min(10_000, Math.max(3_000, msLeft(deadlineMs) - 2_000)),
        });

        if (!res.ok) return null;
        const json = await res.json();
        const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) return null;

        const extracted = JSON.parse(toolCall.function.arguments);

        // Prevent hallucinated emails (must be present in page text)
        if (extracted?.email) {
          const e = String(extracted.email).trim().toLowerCase();
          if (!observedEmails.includes(e)) extracted.email = null;
        }

        return {
          ...extracted,
          source: "web_search",
          source_url: url,
          source_title: title || null,
          source_excerpt: cleanExcerpt(url, markdown).slice(0, 600) || null,
          linkedin_url: extracted.linkedin_url || (isLikelyLinkedInProfileUrl(url) ? url : null),
          github_url: extracted.github_url || (isLikelyGitHubProfileUrl(url) ? url : null),
          website:
            extracted.website ||
            (!isLikelyLinkedInProfileUrl(url) && !isLikelyGitHubProfileUrl(url) ? url : null),
        };
      } catch {
        return null;
      }
    });

    const settled = await settledInBatches(tasks, 3);
    const enrichedByUrl = new Map<string, any>();
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value?.source_url) {
        enrichedByUrl.set(String(s.value.source_url), s.value);
      }
    }
    debug.extracted_ok = enrichedByUrl.size;

    const merged = baseProfiles.map((p) => enrichedByUrl.get(String(p.source_url)) ?? p);

    return new Response(
      JSON.stringify({
        success: true,
        profiles: merged.slice(0, cappedLimit),
        total_found: results.length,
        debug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("web-search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

