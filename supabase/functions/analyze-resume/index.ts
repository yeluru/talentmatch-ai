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

    const { resumeText, jobDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

const systemPrompt = `You are an ACCURATE and FAIR AI resume analyst for MatchTalent AI.

CRITICAL MATCHING RULES:
1. Match based on SPECIFIC SKILLS AND EXPERIENCE required, not general career level
2. A senior leadership role does NOT automatically qualify for a hands-on technical role requiring different skills
3. Required certifications and specific platform experience (ServiceNow, Salesforce, SAP, etc.) MUST be present for high scores
4. Years of experience in UNRELATED technologies don't transfer to specialized platforms

SCORING GUIDELINES:
- 0-25%: Complete skill mismatch (e.g., Engineering Director vs ServiceNow Developer with no ServiceNow experience)
- 26-45%: Same industry but different specialization, minimal skill overlap
- 46-60%: Some transferable skills, but missing core required technologies/certifications
- 61-75%: Has many required skills but missing key requirements or certifications
- 76-85%: Strong match, has most required skills including core technologies
- 86-95%: Excellent match, meets nearly all requirements
- 96-100%: Perfect match

WHAT TO CHECK:
1. Does the resume have the SPECIFIC technologies listed in requirements? (e.g., ServiceNow, JavaScript, specific APIs)
2. Does the resume show hands-on experience or just management of teams using these technologies?
3. Are required certifications present?
4. Is the experience at the right level? (IC role needs IC experience, not just leadership)
5. Are the years of experience in the RELEVANT technology, not just total years?

IMPORTANT DISTINCTIONS:
- Managing engineers who use ServiceNow ≠ Being a ServiceNow Developer
- General JavaScript experience ≠ ServiceNow scripting experience
- Leading distributed systems teams ≠ Configuring GRC modules
- Enterprise architecture ≠ Platform-specific development

Your analysis must include:
1. An ACCURATE match score based on actual skill overlap with job requirements
2. List of matched skills - only those explicitly found and relevant
3. List of critical missing skills - especially certifications and required platform experience
4. Key strengths the candidate brings
5. Honest assessment of gaps
6. Recommendations - including whether this role is a good fit at all

Be fair but accurate. Don't inflate scores based on seniority when the role requires different skills.`;

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
