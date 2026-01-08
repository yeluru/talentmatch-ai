import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { searchQuery, candidates } = await req.json();

    console.log("Talent search query:", searchQuery);
    console.log("Candidates to analyze:", candidates?.length || 0);

    const systemPrompt = `You are an expert talent search AI assistant (like PeopleGPT). Your job is to understand natural language queries about candidates and match them against a candidate database.

When given a search query like "Senior software engineer in San Francisco with fintech experience", you should:
1. Parse the query to understand: job title/role, location, experience level, skills, industry, etc.
2. Score each candidate on how well they match (0-100)
3. Provide a brief explanation of why each candidate matches or doesn't match
4. Highlight key matching attributes

Be intelligent about synonyms and related terms. For example:
- "fintech" matches "financial technology", "payments", "banking software"
- "senior" matches "lead", "principal", "staff" or 5+ years experience
- Location matching should consider remote-friendly candidates`;

    const candidateSummaries = candidates.map((c: any, i: number) => 
      `[${i + 1}] ${c.name || 'Unknown'}
       Title: ${c.title || 'N/A'}
       Experience: ${c.years_experience || 0} years
       Skills: ${c.skills?.join(', ') || 'None listed'}
       Location: ${c.location || 'N/A'}
       Summary: ${c.summary || 'N/A'}`
    ).join('\n\n');

    const userPrompt = `Search Query: "${searchQuery}"

Candidates to evaluate:
${candidateSummaries}

Analyze each candidate and return a ranked list of matches.`;

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

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Search results:", result);

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
