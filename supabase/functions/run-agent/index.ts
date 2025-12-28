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
    const { agentId, searchCriteria, candidates } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!candidates || candidates.length === 0) {
      console.log("No candidates provided to evaluate");
      return new Response(
        JSON.stringify({ 
          error: "No candidates to evaluate", 
          recommendations: [],
          summary: "No candidates were provided for evaluation",
          total_evaluated: 0 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Running agent:", agentId);
    console.log("Search criteria:", JSON.stringify(searchCriteria));
    console.log("Candidates to evaluate:", candidates.length);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const systemPrompt = `You are an autonomous AI recruiting agent. Your job is to continuously evaluate candidates against job criteria and recommend the best matches.

You should:
1. Score each candidate (0-100) based on how well they match the criteria
2. Provide a detailed reason for each recommendation
3. Flag any candidates that are exceptionally good fits (score >= 85)
4. Be thorough but also practical - focus on must-have skills first

Criteria to match against:
${JSON.stringify(searchCriteria, null, 2)}`;

    const candidateSummaries = candidates.map((c: any, i: number) => 
      `[${i + 1}] ID: ${c.id}
       Name: ${c.name || 'Unknown'}
       Title: ${c.title || 'N/A'}
       Experience: ${c.years_experience || 0} years
       Skills: ${c.skills?.join(', ') || 'None listed'}
       Summary: ${c.summary || 'N/A'}`
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
          { role: "user", content: `Evaluate these candidates:\n\n${candidateSummaries}` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "recommend_candidates",
            description: "Returns AI agent recommendations for candidates",
            parameters: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      candidate_id: { type: "string" },
                      match_score: { type: "number" },
                      recommendation_reason: { type: "string" },
                      is_high_priority: { type: "boolean" }
                    },
                    required: ["candidate_id", "match_score", "recommendation_reason"]
                  }
                },
                summary: { type: "string" },
                total_evaluated: { type: "number" },
                top_matches_count: { type: "number" }
              },
              required: ["recommendations", "summary", "total_evaluated"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "recommend_candidates" } }
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

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Agent recommendations:", result);

    // Store recommendations in database
    if (agentId && result.recommendations?.length > 0) {
      for (const rec of result.recommendations) {
        await supabase
          .from('agent_recommendations')
          .upsert({
            agent_id: agentId,
            candidate_id: rec.candidate_id,
            match_score: rec.match_score,
            recommendation_reason: rec.recommendation_reason,
            status: rec.is_high_priority ? 'high_priority' : 'pending'
          }, { onConflict: 'agent_id,candidate_id' });
      }

      // Update agent stats
      await supabase
        .from('ai_recruiting_agents')
        .update({
          last_run_at: new Date().toISOString(),
          candidates_found: result.recommendations.filter((r: any) => r.match_score >= 70).length
        })
        .eq('id', agentId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Agent run error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
