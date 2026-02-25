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

  let searchJobId: string | null = null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    searchJobId = body?.searchJobId;

    if (!searchJobId) {
      return new Response(JSON.stringify({ error: "Missing searchJobId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing search job:", searchJobId);

    // Fetch search job
    const { data: searchJob, error: fetchErr } = await supabase
      .from('talent_search_jobs')
      .select('*, jobs(title, required_skills, nice_to_have_skills)')
      .eq('id', searchJobId)
      .single();

    if (fetchErr || !searchJob) {
      throw new Error("Search job not found");
    }

    // Update status to processing
    await supabase
      .from('talent_search_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', searchJobId);

    // Get job skills
    const job = searchJob.jobs;
    const skills = [
      ...(job?.required_skills || []),
      ...(job?.nice_to_have_skills || [])
    ];

    console.log(`Searching for candidates with skills:`, skills.slice(0, 5));

    // Fetch ALL org candidates (no limit)
    const { data: orgCandidates, error: orgErr } = await supabase
      .from("candidate_org_links")
      .select("candidate_id")
      .eq("organization_id", searchJob.organization_id)
      .eq("status", "active");

    if (orgErr) throw orgErr;

    const candidateIds = Array.from(
      new Set((orgCandidates || []).map((r: any) => r?.candidate_id).filter(Boolean))
    );

    console.log(`Found ${candidateIds.length} total candidates in org`);

    // Fetch profiles in batches of 50
    const BATCH_SIZE = 50;
    const allMatches: any[] = [];

    for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
      const batch = candidateIds.slice(i, i + BATCH_SIZE);

      // Fetch candidate profiles with skills
      const { data: profiles, error: profErr } = await supabase
        .from("candidate_profiles")
        .select(`
          id,
          full_name,
          email,
          location,
          current_title,
          years_of_experience,
          summary,
          candidate_skills(skill_name)
        `)
        .in("id", batch);

      if (profErr) {
        console.error("Error fetching profiles:", profErr);
        continue;
      }

      if (!profiles || profiles.length === 0) continue;

      // Prepare candidates for AI ranking
      const candidatesToRank = profiles.map((p: any) => {
        const name = p.full_name || (p.email ? String(p.email).split("@")[0] : "") || "Candidate";
        const candidateSkills = (p.candidate_skills || []).map((s: any) => s?.skill_name).filter(Boolean);

        return {
          id: p.id,
          name,
          title: p.current_title,
          years_experience: p.years_of_experience,
          summary: p.summary ? String(p.summary).slice(0, 200) : null,
          location: p.location,
          skills: candidateSkills.slice(0, 10),
        };
      });

      // AI rank this batch
      const systemPrompt = `You are an expert talent search AI. Rank candidates for the job: "${job?.title}".

Required skills: ${(job?.required_skills || []).join(", ")}

Score 0-100 (70+ = strong match). Provide brief reason for each.`;

      const candidateSummaries = candidatesToRank
        .map((c: any, idx: number) =>
          `[${idx + 1}] ${c.name}
ID: ${c.id}
Title: ${c.title || "N/A"}
Experience: ${c.years_experience || 0} years
Skills: ${c.skills.join(", ") || "None"}
Location: ${c.location || "N/A"}
Summary: ${c.summary || "N/A"}`
        )
        .join("\n\n");

      const { res: aiRes } = await callChatCompletions({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Candidates:\n${candidateSummaries}\n\nRank these candidates.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "rank_candidates",
            parameters: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      candidate_index: { type: "number" },
                      match_score: { type: "number" },
                      match_reason: { type: "string" },
                    },
                    required: ["candidate_index", "match_score", "match_reason"],
                  },
                },
              },
              required: ["matches"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "rank_candidates" } },
        temperature: 0.2,
        timeoutMs: 60000,
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const result = JSON.parse(toolCall.function.arguments);
          const batchMatches = (result.matches || [])
            .map((m: any) => {
              const candidate = candidatesToRank[m.candidate_index - 1];
              return candidate ? {
                ...m,
                candidate_id: candidate.id,
                candidate
              } : null;
            })
            .filter(Boolean);

          allMatches.push(...batchMatches);
        }
      }

      console.log(`Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(candidateIds.length/BATCH_SIZE)}`);
    }

    // Sort by score and save results
    allMatches.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    const topMatches = allMatches.slice(0, 100);

    console.log(`Total matches: ${allMatches.length}, saving top 100`);

    // Save results
    await supabase
      .from('talent_search_jobs')
      .update({
        status: 'completed',
        results: { matches: topMatches },
        total_candidates_searched: candidateIds.length,
        matches_found: topMatches.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', searchJobId);

    return new Response(JSON.stringify({ success: true, matches: topMatches.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Search job processing error:", error);

    // Try to update the search job status to failed
    if (searchJobId) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        await supabaseAdmin
          .from('talent_search_jobs')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date().toISOString()
          })
          .eq('id', searchJobId);

        console.log(`Updated search job ${searchJobId} status to failed`);
      } catch (updateErr) {
        console.error("Failed to update search job status:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
