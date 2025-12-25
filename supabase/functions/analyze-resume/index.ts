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

    const systemPrompt = `You are an expert AI resume analyst for MatchTalent AI, a recruiting platform. 
Analyze the resume against the job description (if provided) or provide general feedback.

Your analysis must include:
1. An overall match score (0-100)
2. List of matched skills found in the resume
3. List of missing skills that would strengthen the candidate
4. Specific, actionable recommendations to improve the resume
5. Key strengths identified
6. Areas for improvement

Be specific, constructive, and professional in your feedback.`;

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
