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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create client with user's auth to verify identity
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    const { agentId, searchCriteria, candidates } = await req.json();
    
    // Verify user has access to this agent's organization
    const { data: agent, error: agentError } = await supabaseAuth
      .from('ai_recruiting_agents')
      .select('organization_id')
      .eq('id', agentId)
      .maybeSingle();

    if (agentError || !agent) {
      console.error("Agent not found or access denied:", agentId);
      return new Response(JSON.stringify({ error: "Forbidden - no access to this agent" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI provider is resolved by callChatCompletions (OPENAI_API_KEY preferred, LOVABLE_API_KEY fallback)

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

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { res: response } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Evaluate these candidates:\n\n${candidateSummaries}` },
      ],
      tools: [
        {
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
                      is_high_priority: { type: "boolean" },
                    },
                    required: ["candidate_id", "match_score", "recommendation_reason"],
                  },
                },
                summary: { type: "string" },
                total_evaluated: { type: "number" },
                top_matches_count: { type: "number" },
              },
              required: ["recommendations", "summary", "total_evaluated"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "recommend_candidates" } },
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
    console.log("Agent recommendations:", JSON.stringify(result));

    // Store recommendations in database
    if (agentId && result.recommendations?.length > 0) {
      console.log(`Storing ${result.recommendations.length} recommendations for agent ${agentId}`);
      
      for (const rec of result.recommendations) {
        console.log(`Storing recommendation for candidate ${rec.candidate_id} with score ${rec.match_score}`);
        
        const { error: upsertError } = await supabase
          .from('agent_recommendations')
          .upsert({
            agent_id: agentId,
            candidate_id: rec.candidate_id,
            match_score: rec.match_score,
            recommendation_reason: rec.recommendation_reason,
            status: rec.is_high_priority ? 'high_priority' : 'pending'
          }, { onConflict: 'agent_id,candidate_id' });
        
        if (upsertError) {
          console.error('Error storing recommendation:', upsertError);
        }
      }

      // Update agent stats
      const { error: updateError } = await supabase
        .from('ai_recruiting_agents')
        .update({
          last_run_at: new Date().toISOString(),
          candidates_found: result.recommendations.filter((r: any) => r.match_score >= 70).length
        })
        .eq('id', agentId);
      
      if (updateError) {
        console.error('Error updating agent stats:', updateError);
      }
    } else {
      console.log('No recommendations to store or no agentId provided');
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
