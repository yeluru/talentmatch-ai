import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function firecrawlSearch(args: {
  apiKey: string;
  query: string;
  limit: number;
  country: string;
}): Promise<{ success: boolean; data: any[] }> {
  const { apiKey, query, limit, country } = args;
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
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error("Firecrawl search error:", resp.status, errorText);
    throw new Error(`Search failed: ${resp.status}`);
  }

  const json = await resp.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  return { success: Boolean(json?.success), data };
}

function isLikelyLinkedInProfileUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return u.includes("linkedin.com/in/");
}

function isLikelyGitHubProfileUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  // Basic heuristic: github.com/<user> (not repo)
  return u.includes("github.com/") && !u.includes("github.com/search") && !u.includes("github.com/topics");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
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

    // Verify user has recruiter role
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["recruiter", "account_manager"])
      .maybeSingle();

    if (!userRole) {
      return new Response(JSON.stringify({ error: "Forbidden - requires recruiter or manager role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, limit = 20, country = "us", includeLinkedIn = false } = await req.json();
    const rawQuery = String(query || "").trim();
    if (!rawQuery) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured. Please connect Firecrawl in settings.");
    }

    const cappedLimit = Math.max(1, Math.min(Number(limit) || 20, 50));

    const fcCountry = String(country || "us").toLowerCase();

    // Public web search strategy:
    // 1) Try a "candidate page" query (resume/cv/portfolio/github)
    // 2) If that yields nothing, retry with broader query (still excluding LinkedIn by default)
    // 3) If still nothing, try a GitHub-focused query (often best for dev roles)
    const baseConstraint = includeLinkedIn ? "" : " -site:linkedin.com";
    const queriesToTry: string[] = [
      `${rawQuery} (resume OR cv OR portfolio OR github OR "about me")${baseConstraint}`,
      `${rawQuery}${baseConstraint}`,
      `site:github.com ${rawQuery}${baseConstraint}`,
    ];

    console.log("[web-search] rawQuery:", rawQuery);
    console.log("[web-search] queriesToTry:", queriesToTry);

    const debug = {
      country: fcCountry,
      includeLinkedIn: Boolean(includeLinkedIn),
      queries_tried: [] as { query: string; results: number }[],
    };

    let searchResults: any[] = [];
    for (const q of queriesToTry) {
      const out = await firecrawlSearch({
        apiKey: FIRECRAWL_API_KEY,
        query: q,
        limit: cappedLimit,
        country: fcCountry,
      });
      const count = out?.data?.length || 0;
      debug.queries_tried.push({ query: q, results: count });
      if (out.success && count > 0) {
        searchResults = out.data.slice(0, cappedLimit);
        break;
      }
    }

    if (!searchResults.length) {
      return new Response(JSON.stringify({
        success: true,
        profiles: [],
        total_found: 0,
        message: "No profiles found for this search query",
        debug,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = searchResults;
    const profiles: any[] = [];

    for (const result of results) {
      const url = String(result?.url || "").trim();
      const title = String(result?.title || "").trim();
      const markdown = String(result?.markdown || "");

      if (!url || !markdown || markdown.length < 200) continue;

      // Heuristic mapping for provenance/contact links
      const isLinkedIn = isLikelyLinkedInProfileUrl(url);
      const isGitHub = isLikelyGitHubProfileUrl(url);

      try {
        const { res: aiResponse } = await callChatCompletions({
          messages: [
            {
              role: "system",
              content:
                `You extract candidate profile information from public web pages (resume/portfolio/GitHub/about pages).
Return the best-effort structured data. If unknown, return null. Do not hallucinate emails/companies.`,
            },
            {
              role: "user",
              content: `Extract candidate profile information from this page:

URL: ${url}
Title: ${title}

Content:
${markdown.substring(0, 15000)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_profile",
                description: "Extract structured candidate profile data from web page content",
                parameters: {
                  type: "object",
                  properties: {
                    full_name: { type: "string", description: "Person's full name" },
                    headline: { type: "string", description: "Professional headline/title" },
                    current_company: { type: "string", description: "Current employer" },
                    location: { type: "string", description: "Geographic location" },
                    skills: { type: "array", items: { type: "string" } },
                    experience_years: { type: "number", description: "Estimated years of experience" },
                    summary: { type: "string", description: "Brief professional summary" },
                    email: { type: "string", description: "Email address if explicitly present" },
                    linkedin_url: { type: "string", description: "LinkedIn URL if explicitly present" },
                    github_url: { type: "string", description: "GitHub profile URL if explicitly present" },
                    website: { type: "string", description: "Personal website/portfolio URL if explicitly present" },
                  },
                  required: ["full_name"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_profile" } },
        });

        if (!aiResponse.ok) continue;
        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) continue;

        const extracted = JSON.parse(toolCall.function.arguments);

        // Provide stable source links even if model didn't return them
        const normalized: any = {
          ...extracted,
          source: "web_search",
        };
        if (isLinkedIn && !normalized.linkedin_url) normalized.linkedin_url = url;
        if (isGitHub && !normalized.github_url) normalized.github_url = url;
        if (!isLinkedIn && !isGitHub && !normalized.website) normalized.website = url;

        // Add provenance (safe to ignore downstream if not persisted)
        normalized.source_url = url;

        profiles.push(normalized);
      } catch (e) {
        console.error("Error parsing web profile:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      profiles,
      total_found: results.length,
      debug,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("web-search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

