import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateProfile, jobs } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert AI career advisor for MatchTalent AI.
Your job is to analyze a candidate's profile and rank job opportunities by fit.

Consider:
1. Skills match
2. Experience level alignment
3. Location/remote preferences
4. Salary expectations
5. Career growth potential

Provide honest, helpful recommendations.`;

    const jobsSummary = jobs.map((j: any, i: number) => 
      `Job ${i + 1}:
- ID: ${j.id}
- Title: ${j.title}
- Company: ${j.organization_name || 'Company'}
- Location: ${j.location || 'Not specified'}${j.is_remote ? ' (Remote)' : ''}
- Experience: ${j.experience_level || 'Not specified'}
- Salary: ${j.salary_min && j.salary_max ? `$${j.salary_min.toLocaleString()} - $${j.salary_max.toLocaleString()}` : 'Not disclosed'}
- Required Skills: ${j.required_skills?.join(', ') || 'Not specified'}
- Description: ${j.description?.substring(0, 200)}...`
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
          { role: "user", content: `Rank these jobs for the following candidate:

CANDIDATE PROFILE:
- Title: ${candidateProfile.current_title || 'Not specified'}
- Experience: ${candidateProfile.years_of_experience || 0} years
- Skills: ${candidateProfile.skills?.join(', ') || 'Not specified'}
- Desired Locations: ${candidateProfile.desired_locations?.join(', ') || 'Flexible'}
- Open to Remote: ${candidateProfile.is_open_to_remote ? 'Yes' : 'No'}
- Salary Range: ${candidateProfile.desired_salary_min && candidateProfile.desired_salary_max ? `$${candidateProfile.desired_salary_min.toLocaleString()} - $${candidateProfile.desired_salary_max.toLocaleString()}` : 'Not specified'}

AVAILABLE JOBS:
${jobsSummary}

Rank each job by fit for this candidate.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "rank_jobs",
              description: "Return ranked job recommendations",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        job_id: { type: "string" },
                        match_score: { type: "number" },
                        why_good_fit: { type: "array", items: { type: "string" } },
                        considerations: { type: "array", items: { type: "string" } },
                        recommendation_level: { 
                          type: "string",
                          enum: ["highly_recommended", "recommended", "consider", "not_ideal"]
                        }
                      },
                      required: ["job_id", "match_score", "why_good_fit", "recommendation_level"]
                    }
                  }
                },
                required: ["recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "rank_jobs" } }
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
      throw new Error("No recommendations returned from AI");
    }

    const recommendations = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(recommendations), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("recommend-jobs error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
