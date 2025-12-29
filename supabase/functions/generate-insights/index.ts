import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

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

    const { candidates, jobContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Generating insights for", candidates?.length || 0, "candidates");

    const systemPrompt = `You are a talent analytics expert. Analyze a pool of candidates and generate visual insights about:
1. Skills distribution - what skills are most common
2. Experience levels - breakdown by years of experience
3. Company backgrounds - where candidates have worked
4. Education - degrees and institutions
5. Location distribution
6. Industry trends

Return structured data that can be used to create charts and graphs.`;

    const candidateSummaries = candidates.map((c: any) => 
      `- ${c.name || 'Unknown'}: ${c.title || 'N/A'}, ${c.years_experience || 0}y exp, Skills: ${c.skills?.slice(0, 5).join(', ') || 'None'}`
    ).join('\n');

    const userPrompt = `Analyze this candidate pool${jobContext ? ` for the role: ${jobContext}` : ''}:

${candidateSummaries}

Generate insights that would help a recruiter understand the talent market.`;

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
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_insights",
            description: "Generate talent pool analytics and insights",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Executive summary of the talent pool" },
                total_candidates: { type: "number" },
                skills_distribution: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill: { type: "string" },
                      count: { type: "number" },
                      percentage: { type: "number" }
                    }
                  }
                },
                experience_distribution: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      range: { type: "string" },
                      count: { type: "number" },
                      percentage: { type: "number" }
                    }
                  }
                },
                top_companies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      company: { type: "string" },
                      count: { type: "number" }
                    }
                  }
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["summary", "total_candidates", "skills_distribution", "experience_distribution"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_insights" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const insights = JSON.parse(toolCall.function.arguments);
    console.log("Generated insights:", insights);

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Insights generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
