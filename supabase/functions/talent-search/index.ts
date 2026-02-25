import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIlikeOr(parts: string[], column: string) {
  const cleaned = parts
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!cleaned.length) return "";
  // PostgREST .or() format: "col.ilike.%foo%,col.ilike.%bar%"
  return cleaned
    .map((p) => `${column}.ilike.%${p.replaceAll("%", "").replaceAll(",", " ")}%`)
    .join(",");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    const body = await req.json();
    const searchQuery = body?.searchQuery;
    const candidates = body?.candidates;
    const organizationId = body?.organizationId;
    const structuredSearch = body?.structuredSearch; // From "Search by Job" mode
    const prefilterLimit = Number(body?.prefilterLimit || 200);
    const topN = Number(body?.topN || 30);

    console.log("Talent search query:", searchQuery);
    console.log("Structured search:", structuredSearch ? "Yes (skip AI parsing)" : "No");
    console.log("Candidates provided:", Array.isArray(candidates) ? candidates.length : 0);
    console.log("Organization:", organizationId || "n/a");

    if (!searchQuery || typeof searchQuery !== "string") {
      return new Response(JSON.stringify({ error: "Missing searchQuery" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedQuery: any = {};

    // ----------------------------
    // 1) Parse query (skip if structured data provided)
    // ----------------------------
    if (structuredSearch) {
      // Search by Job mode - use structured data directly
      console.log("Using structured job data:", structuredSearch.jobId);
      parsedQuery = {
        role: structuredSearch.role || "",
        skills: structuredSearch.skills || [],
        location: "",
      };
    } else {
      // Free text search - use AI to parse
      console.log("Parsing free text query with AI");
      const parseSystem =
        `You are an expert recruiter assistant. Extract structured filters from a natural language candidate search query.\n` +
        `Return concise values. Keep skills normalized (e.g. "react", "typescript", "postgres").`;

      const { res: parseRes } = await callChatCompletions({
        messages: [
          { role: "system", content: parseSystem },
          { role: "user", content: `Query: "${searchQuery}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_query",
              description: "Parse a talent search query into structured filters",
              parameters: {
                type: "object",
                properties: {
                  role: { type: "string" },
                  location: { type: "string" },
                  experience_level: { type: "string" },
                  skills: { type: "array", items: { type: "string" } },
                  industry: { type: "string" },
                },
                required: [],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_query" } },
        temperature: 0.1,
        timeoutMs: 20000,
      });

      if (!parseRes.ok) {
        const t = await parseRes.text();
        console.error("Parse error:", parseRes.status, t);
        throw new Error(`AI parse error: ${parseRes.status}`);
      }

      const parseJson = await parseRes.json();
      const parseToolCall = parseJson.choices?.[0]?.message?.tool_calls?.[0];
      parsedQuery = parseToolCall?.function?.arguments
        ? JSON.parse(parseToolCall.function.arguments)
        : {};
    }

    // ----------------------------
    // 2) Prefilter candidates in DB
    // ----------------------------
    let candidatesToRank: any[] = [];

    if (Array.isArray(candidates) && candidates.length > 0) {
      // Backwards compatible path (small orgs only)
      candidatesToRank = candidates;
    } else {
      if (!organizationId) {
        return new Response(JSON.stringify({ error: "Missing organizationId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const skills = Array.isArray(parsedQuery?.skills) ? parsedQuery.skills : [];
      const role = String(parsedQuery?.role || "").trim();
      const location = String(parsedQuery?.location || "").trim();

      let candidateIds: string[] = [];

      if (skills.length) {
        const skillsOr = toIlikeOr(skills, "skill_name");
        const { data: skillRows, error: skillErr } = await supabase
          .from("candidate_skills")
          .select("candidate_id")
          .or(skillsOr)
          .limit(5000);
        if (skillErr) throw skillErr;
        const skillIds = Array.from(
          new Set((skillRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
        ).slice(0, 5000);

        if (skillIds.length) {
          const { data: linkRows, error: linkErr } = await supabase
            .from("candidate_org_links")
            .select("candidate_id")
            .eq("organization_id", organizationId)
            .eq("status", "active")
            .in("candidate_id", skillIds)
            .limit(Math.max(50, prefilterLimit));
          if (linkErr) throw linkErr;
          candidateIds = Array.from(
            new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
          );
        }
      } else {
        let q = supabase
          .from("candidate_org_links")
          .select(
            `candidate_id,
             candidate_profiles(
               id,
               full_name,
               email,
               location,
               current_title,
               years_of_experience,
               summary,
               desired_locations
             )`,
          )
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .limit(Math.max(50, prefilterLimit));

        if (role) q = q.ilike("candidate_profiles.current_title", `%${role}%`);
        if (location) q = q.ilike("candidate_profiles.location", `%${location}%`);

        const { data: linkRows, error: linkErr } = await q;
        if (linkErr) throw linkErr;
        candidateIds = Array.from(
          new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
        );
      }

      // Fallback: if filters are too strict, take recent org-linked candidates (still capped)
      if (!candidateIds.length) {
        const { data: linkRows, error: linkErr } = await supabase
          .from("candidate_org_links")
          .select("candidate_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(Math.max(50, prefilterLimit));
        if (linkErr) throw linkErr;
        candidateIds = Array.from(
          new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
        );
      }

      if (!candidateIds.length) {
        return new Response(JSON.stringify({ parsed_query: parsedQuery, matches: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const idsCapped = candidateIds.slice(0, Math.max(50, prefilterLimit));
      const { data: profiles, error: profErr } = await supabase
        .from("candidate_profiles")
        .select(
          `
          id,
          full_name,
          email,
          location,
          current_title,
          years_of_experience,
          summary,
          desired_locations,
          candidate_skills(skill_name)
        `,
        )
        .in("id", idsCapped);
      if (profErr) throw profErr;

      candidatesToRank = (profiles || []).map((p: any) => {
        const name =
          p.full_name || (p.email ? String(p.email).split("@")[0] : "") || "Candidate";
        const loc =
          p.location ||
          (Array.isArray(p.desired_locations) ? p.desired_locations[0] : null) ||
          null;
        const skills = (p.candidate_skills || []).map((s: any) => s?.skill_name).filter(Boolean);
        return {
          id: p.id,
          name,
          title: p.current_title,
          years_experience: p.years_of_experience,
          summary: p.summary,
          location: loc,
          skills,
        };
      });
    }

    console.log("Candidates to rank (prefiltered):", candidatesToRank.length);

    // ----------------------------
    // 3) LLM re-rank (subset only)
    // ----------------------------
    const systemPrompt = `You are an expert talent search AI assistant (like PeopleGPT). Rank candidates for the given query.

Scoring rules:
- Use an integer match_score from 0 to 100 (0 = no match, 100 = perfect match).
- If the query is a single skill like "React", strong React candidates should generally score > 70.
- Provide a short 1-2 sentence match_reason for each returned candidate.

Return only the best matches (do not return everyone).`;

    const candidateSummaries = candidatesToRank
      .map(
        (c: any, i: number) =>
          `[${i + 1}] ${c.name || "Candidate"}
ID: ${c.id}
Title: ${c.title || "N/A"}
Experience: ${c.years_experience || 0} years
Skills: ${Array.isArray(c.skills) ? c.skills.join(", ") : "None listed"}
Location: ${c.location || "N/A"}
Summary: ${c.summary || "N/A"}`,
      )
      .join("\n\n");

    const userPrompt = `Search Query: "${searchQuery}"

Candidates to evaluate:
${candidateSummaries}

Return the TOP ${topN} candidates (or fewer if there are not enough good matches).`;

    const { res: response } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "rank_candidates",
            description: "Returns ranked candidates based on search query match",
            parameters: {
              type: "object",
              properties: {
                parsed_query: {
                  type: "object",
                  properties: {
                    role: { type: "string" },
                    location: { type: "string" },
                    experience_level: { type: "string" },
                    skills: { type: "array", items: { type: "string" } },
                    industry: { type: "string" },
                  },
                },
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      candidate_index: { type: "number" },
                      candidate_id: { type: "string", description: "Candidate ID (uuid). Prefer using the ID provided in the candidate summary." },
                      match_score: { type: "number" },
                      match_reason: { type: "string" },
                      matched_criteria: { type: "array", items: { type: "string" } },
                      missing_criteria: { type: "array", items: { type: "string" } },
                    },
                    required: ["candidate_index", "match_score", "match_reason"],
                  },
                },
              },
              required: ["parsed_query", "matches"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "rank_candidates" } },
      temperature: 0.2,
      timeoutMs: 30000,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const rawResult = JSON.parse(toolCall.function.arguments);
    const matchesIn = Array.isArray(rawResult?.matches) ? rawResult.matches : [];
    const matches = matchesIn
      .map((m: any) => {
        const idx = Number(m?.candidate_index || 0);
        const c = candidatesToRank?.[idx - 1];
        return {
          ...m,
          // Always trust our DB candidate id; LLM may hallucinate ids.
          candidate_id: c?.id,
          candidate: c || null,
        };
      })
      .filter((m: any) => m?.candidate_id);

    const result = {
      parsed_query: rawResult?.parsed_query || parsedQuery || {},
      matches,
    };
    console.log("Search results:", { matches: matches.length });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Talent search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
