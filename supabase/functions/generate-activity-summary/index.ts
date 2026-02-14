import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { userId, organizationId, activityDate, actingRole } = body;

    if (!userId || !organizationId || !activityDate) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch activity data
    const { data: activity, error: activityError } = await supabase
      .from('daily_user_activity')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('activity_date', activityDate)
      .eq('acting_role', actingRole || 'recruiter')
      .single();

    // Fetch user profile separately
    let userName = 'User';
    if (activity && !activityError) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .single();

      if (profile) {
        userName = profile.full_name;
      }
    }

    if (activityError || !activity) {
      // Try to aggregate if not found
      console.log('Activity not found, attempting to aggregate...');
      const { data: aggResult, error: aggError } = await supabase
        .rpc('aggregate_user_activity', {
          p_user_id: userId,
          p_organization_id: organizationId,
          p_date: activityDate,
          p_acting_role: actingRole || null
        });

      if (aggError) {
        console.error('Aggregation error:', aggError);
        return new Response(JSON.stringify({ error: 'Failed to aggregate activity data' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch again after aggregation
      const { data: newActivity, error: newError } = await supabase
        .from('daily_user_activity')
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .eq('activity_date', activityDate)
        .eq('acting_role', actingRole || 'recruiter')
        .single();

      if (newError || !newActivity) {
        return new Response(JSON.stringify({ error: 'No activity data available' }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign the new activity data
      Object.assign(activity, newActivity);

      // Fetch profile again after aggregation
      const { data: profileAfterAgg } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .single();

      if (profileAfterAgg) {
        userName = profileAfterAgg.full_name;
      }
    }

    // Fetch team average for comparison (optional but adds context)
    const { data: teamStats } = await supabase
      .from('daily_user_activity')
      .select('total_active_minutes, candidates_imported, candidates_moved')
      .eq('organization_id', organizationId)
      .eq('activity_date', activityDate);

    const teamAvgMinutes = teamStats && teamStats.length > 0
      ? Math.round(teamStats.reduce((sum, s) => sum + (s.total_active_minutes || 0), 0) / teamStats.length)
      : 0;
    const teamAvgImported = teamStats && teamStats.length > 0
      ? Math.round(teamStats.reduce((sum, s) => sum + (s.candidates_imported || 0), 0) / teamStats.length)
      : 0;

    // Build context for AI
    const role = actingRole || 'recruiter';
    const date = new Date(activityDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const systemPrompt = `You are an AI assistant that generates concise, insightful activity summaries for managers reviewing their team's performance.

Guidelines:
- Write in third person, past tense
- Be positive and constructive in tone
- Highlight notable achievements or patterns
- Mention comparison to team average when significantly above/below
- Keep it to 3-4 sentences maximum
- Focus on impact and outcomes, not just numbers
- If activity is low, be neutral and factual (don't criticize)

Examples of good summaries:
✓ "Sarah had a highly productive day with strong focus on the AWS Security Engineer role. She imported 12 candidates from LinkedIn and moved 8 candidates through the pipeline, with 3 reaching interview stage. Her 6.5 hours of active time was 23% above team average. She also sent 4 RTR documents, showing strong follow-through."

✓ "Mike spent 4.2 hours actively working on candidate sourcing, importing 5 candidates and adding detailed notes to 8 profiles. His focus on quality over quantity is evident in his thorough documentation. Activity level was consistent with team norms."

✓ "Lisa had a lighter day with 2.1 hours of activity, primarily focused on pipeline maintenance and updating candidate statuses. She moved 3 candidates to screening stage. This may indicate focus on other priorities or administrative work outside the system."

Bad examples to avoid:
✗ "User was not very productive today with only 2 imports." (Too negative)
✗ "Sarah logged in 3 times and imported 12 candidates and moved 8 candidates..." (Just listing numbers)
✗ "The user had an average day." (Too vague, no insight)`;

    const userPrompt = `Generate an activity summary for ${userName} (${role}) for ${date}.

Activity Metrics:
- Active time: ${activity.total_active_minutes || 0} minutes (${Math.round((activity.total_active_minutes || 0) / 60 * 10) / 10} hours)
- Team average active time: ${teamAvgMinutes} minutes
- Candidates imported: ${activity.candidates_imported || 0}
- Team average imported: ${teamAvgImported}
- Candidates uploaded: ${activity.candidates_uploaded || 0}
- Candidates moved in pipeline: ${activity.candidates_moved || 0}
  - To Screening: ${activity.moved_to_screening || 0}
  - To Interview: ${activity.moved_to_interview || 0}
  - To Offer: ${activity.moved_to_offer || 0}
  - To Hired: ${activity.moved_to_hired || 0}
- Notes added: ${activity.notes_added || 0}
- Jobs created: ${activity.jobs_created || 0}
- RTR documents sent: ${activity.rtr_documents_sent || 0}
- Applications created: ${activity.applications_created || 0}
- Applications updated: ${activity.applications_updated || 0}
- Jobs worked on: ${activity.jobs_worked_on ? activity.jobs_worked_on.length : 0} different jobs

Generate a 3-4 sentence summary that provides meaningful insights for a manager.`;

    // Call LLM
    const { res, provider } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      timeoutMs: 15000,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`AI provider error (${provider}):`, res.status, errorText);
      throw new Error(`AI provider returned ${res.status}`);
    }

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!summary) {
      throw new Error("AI provider returned empty summary");
    }

    // Update the activity record with the summary
    const { error: updateError } = await supabase
      .from('daily_user_activity')
      .update({
        ai_summary: summary,
        summary_generated_at: new Date().toISOString()
      })
      .eq('id', activity.id);

    if (updateError) {
      console.error('Failed to update summary:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      summary,
      provider,
      metrics: {
        active_minutes: activity.total_active_minutes,
        candidates_imported: activity.candidates_imported,
        candidates_moved: activity.candidates_moved,
        rtr_sent: activity.rtr_documents_sent,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error generating activity summary:", message);
    return new Response(JSON.stringify({
      success: false,
      error: message,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
