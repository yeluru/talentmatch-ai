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
    const { resumeText, jobDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

const systemPrompt = `You are a FAIR and BALANCED AI resume analyst for MatchTalent AI.

SCORING GUIDELINES - Be accurate, not harsh:
1. Score 0-20%: Complete career mismatch (e.g., retail clerk applying for ML engineer)
2. Score 21-40%: Different career track with minimal overlap
3. Score 41-60%: Some relevant experience but missing key requirements
4. Score 61-75%: Good match with some gaps in specific areas
5. Score 76-85%: Strong match, meets most requirements
6. Score 86-95%: Excellent match, minor gaps only
7. Score 96-100%: Near-perfect match

ANALYSIS APPROACH:
1. Look for EQUIVALENT experience, not just exact keyword matches
2. Leadership roles (Director, VP, etc.) often imply hands-on technical background
3. Similar domain experience matters (e.g., ad-tech, e-commerce, fintech)
4. Scale of previous work matters (team size, system scale, user impact)
5. Consider transferable skills and career progression
6. Industry experience at the SAME company is highly relevant

WHAT TO CREDIT:
- Direct experience in similar roles or domains
- Leadership of relevant technical teams
- Work at comparable scale (millions of users, billions of requests)
- Equivalent technologies even if not exact match
- Prior experience at the hiring company itself

WHAT COUNTS AS GAPS:
- Specific technical depth not demonstrated (but don't assume absence)
- Scale differences (managed 10 people vs. role needs 100)
- Missing specific domain knowledge

Your analysis must include:
1. A FAIR match score (0-100) reflecting overall fit
2. List of matched skills and relevant experience
3. List of gaps or areas where more evidence would help
4. Key strengths the candidate brings
5. Areas for improvement
6. Constructive recommendations

Be balanced - acknowledge strengths while noting genuine gaps.`;

    const userPrompt = jobDescription 
      ? `Analyze this resume against the job description:

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Provide a detailed analysis with match score, matched skills, missing skills, and recommendations.`
      : `Analyze this resume and provide feedback:

RESUME:
${resumeText}

Provide a detailed analysis with an overall ATS score, identified skills, key strengths, areas for improvement, and recommendations.`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_resume",
              description: "Return structured resume analysis results",
              parameters: {
                type: "object",
                properties: {
                  match_score: { 
                    type: "number", 
                    description: "Overall match/ATS score from 0-100" 
                  },
                  matched_skills: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Skills found in the resume that match the job or are valuable" 
                  },
                  missing_skills: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Skills not found that would strengthen the candidate" 
                  },
                  key_strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key strengths identified in the resume"
                  },
                  areas_for_improvement: {
                    type: "array",
                    items: { type: "string" },
                    description: "Areas that need improvement"
                  },
                  recommendations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Specific actionable recommendations" 
                  },
                  summary: {
                    type: "string",
                    description: "Brief overall summary of the analysis"
                  }
                },
                required: ["match_score", "matched_skills", "missing_skills", "recommendations", "summary"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_resume" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
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
      throw new Error("No analysis returned from AI");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("analyze-resume error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
