import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
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

    const { jobDescription, jobTitle, requiredSkills, candidates } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert AI recruiter for MatchTalent AI. 
Your job is to analyze candidates and score how well they match a job posting.

For each candidate, provide:
1. A match score (0-100) based on skills, experience, and fit
2. Key matching points explaining why they're a good fit
3. Potential concerns or gaps
4. Overall recommendation (strong_match, good_match, partial_match, weak_match)

Be objective and focus on actual qualifications.`;

    const candidatesSummary = candidates.map((c: any, i: number) => 
      `Candidate ${i + 1}:
- ID: ${c.id}
- Title: ${c.current_title || 'Not specified'}
- Company: ${c.current_company || 'Not specified'}
- Experience: ${c.years_of_experience || 0} years
- Skills: ${c.skills?.join(', ') || 'Not specified'}
- Summary: ${c.summary || 'Not provided'}`
    ).join('\n\n');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these candidates for the following job:

JOB TITLE: ${jobTitle}
REQUIRED SKILLS: ${requiredSkills?.join(', ') || 'Not specified'}
JOB DESCRIPTION:
${jobDescription}

CANDIDATES:
${candidatesSummary}

Score and rank each candidate.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "rank_candidates",
              description: "Return ranked candidate matches",
              parameters: {
                type: "object",
                properties: {
                  rankings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        candidate_id: { type: "string" },
                        match_score: { type: "number" },
                        matching_points: { type: "array", items: { type: "string" } },
                        concerns: { type: "array", items: { type: "string" } },
                        recommendation: { 
                          type: "string",
                          enum: ["strong_match", "good_match", "partial_match", "weak_match"]
                        }
                      },
                      required: ["candidate_id", "match_score", "matching_points", "recommendation"]
                    }
                  }
                },
                required: ["rankings"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "rank_candidates" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
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
      throw new Error("No rankings returned from AI");
    }

    const rankings = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(rankings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("match-candidates error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
