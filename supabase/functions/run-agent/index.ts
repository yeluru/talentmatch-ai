import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
// No AI needed - using deterministic skill matching instead

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
    
    // Verify user has access to this search agent's organization (org-scoped agents only)
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
      console.log("No org-scoped candidates provided to evaluate");
      return new Response(
        JSON.stringify({
          error: "No org-scoped candidates to evaluate",
          recommendations: [],
          summary: "No candidates from this organization were provided for evaluation",
          total_evaluated: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Running search agent:", agentId);
    console.log("Search criteria:", JSON.stringify(searchCriteria));
    console.log("Org-scoped candidates to evaluate:", candidates.length);

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // DETERMINISTIC SKILL MATCHING - No AI hallucinations, no API costs
    const requiredSkills = (searchCriteria?.skills || []).map((s: string) => s.toLowerCase().trim());

    console.log('=== SEARCH AGENT DEBUG ===');
    console.log('Required skills:', requiredSkills);
    console.log('Evaluating candidates:', candidates.length);

    if (requiredSkills.length === 0) {
      console.warn('No required skills specified');
      return new Response(
        JSON.stringify({
          error: "No skills specified in search criteria",
          recommendations: [],
          summary: "Please specify required skills for this search agent",
          total_evaluated: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Evaluate each candidate with exact skill matching
    const recommendations = candidates
      .map((candidate: any) => {
        const candidateSkills = (candidate.skills || []).map((s: string) => s.toLowerCase().trim());

        // Find exact matches (case-insensitive)
        const matchedSkills = requiredSkills.filter((reqSkill: string) =>
          candidateSkills.some((candSkill: string) =>
            candSkill === reqSkill ||
            candSkill.includes(reqSkill) ||
            reqSkill.includes(candSkill)
          )
        );

        const matchCount = matchedSkills.length;
        const matchPercentage = (matchCount / requiredSkills.length) * 100;

        // Base score on skill match percentage
        let score = Math.round(matchPercentage);

        // Bonus: Add up to 15 points for strong experience (3 points per 5 years, max 15)
        const experienceBonus = Math.min(15, Math.floor((candidate.years_experience || 0) / 5) * 3);
        score += experienceBonus;

        // Cap at 100
        score = Math.min(100, score);

        // Build reason with ACTUAL matched skills
        let reason = '';
        if (matchCount === 0) {
          reason = `No matching skills found. Candidate has: ${candidateSkills.join(', ') || 'none listed'}`;
        } else if (matchCount === requiredSkills.length) {
          reason = `Perfect match! Has all ${matchCount} required skills: ${matchedSkills.join(', ')}`;
        } else {
          reason = `Matched ${matchCount}/${requiredSkills.length} skills: ${matchedSkills.join(', ')}`;
        }

        // Add experience note if significant
        if (candidate.years_experience >= 10) {
          reason += ` | ${candidate.years_experience} years experience`;
        }

        return {
          candidate_id: candidate.id,
          match_score: score,
          recommendation_reason: reason,
          is_high_priority: score >= 85,
          matched_count: matchCount,
          candidate_name: candidate.name, // For debugging
        };
      })
      .filter((rec: any) => rec.match_score >= 60) // Only recommend 60+ scores
      .sort((a: any, b: any) => b.match_score - a.match_score); // Sort by score descending

    console.log(`Found ${recommendations.length} matches out of ${candidates.length} candidates`);
    recommendations.slice(0, 5).forEach((rec: any) => {
      console.log(`  - ${rec.candidate_name}: ${rec.match_score}% (${rec.matched_count}/${requiredSkills.length} skills)`);
    });

    const result = {
      recommendations,
      summary: `Evaluated ${candidates.length} candidates. Found ${recommendations.length} matches with 60%+ skill match.`,
      total_evaluated: candidates.length,
      top_matches_count: recommendations.filter((r: any) => r.match_score >= 85).length,
    };

    console.log("Search results:", JSON.stringify(result, null, 2));

    // Store recommendations in database
    if (agentId) {
      // CRITICAL: Delete ALL old recommendations for this agent first to avoid mixing old AI garbage with new results
      console.log(`Deleting old recommendations for agent ${agentId}`);
      const { error: deleteError } = await supabase
        .from('agent_recommendations')
        .delete()
        .eq('agent_id', agentId);

      if (deleteError) {
        console.error('Error deleting old recommendations:', deleteError);
      } else {
        console.log('Old recommendations cleared successfully');
      }

      // Insert fresh recommendations (if any)
      if (result.recommendations?.length > 0) {
        console.log(`Inserting ${result.recommendations.length} new recommendations for agent ${agentId}`);

        for (const rec of result.recommendations) {
          console.log(`Storing recommendation for candidate ${rec.candidate_id} with score ${rec.match_score}`);

          const { error: insertError } = await supabase
            .from('agent_recommendations')
            .insert({
              agent_id: agentId,
              candidate_id: rec.candidate_id,
              match_score: rec.match_score,
              recommendation_reason: rec.recommendation_reason,
              status: rec.is_high_priority ? 'high_priority' : 'pending'
            });

          if (insertError) {
            console.error('Error storing recommendation:', insertError);
          }
        }
      } else {
        console.log('No new recommendations to insert (0 matches found)');
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
      console.log('No agentId provided - skipping database storage');
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
