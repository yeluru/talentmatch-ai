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

    const { candidate, job, recruiterName, companyName, tone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Generating email for candidate:", candidate?.name);

    const systemPrompt = `You are an expert recruiter writing personalized outreach emails. Your emails should:
1. Be personalized with specific details about the candidate's background
2. Clearly explain why they're a good fit for the role
3. Be professional but warm and conversational
4. Include a clear call-to-action
5. Be concise (under 200 words)

Tone: ${tone || 'professional but friendly'}`;

    const userPrompt = `Write a personalized outreach email for:

Candidate:
- Name: ${candidate.name || 'there'}
- Current Title: ${candidate.title || 'Professional'}
- Current Company: ${candidate.company || 'their company'}
- Skills: ${candidate.skills?.join(', ') || 'various skills'}

Job Opportunity:
- Title: ${job.title}
- Company: ${companyName}
- Key Requirements: ${job.required_skills?.join(', ') || 'various skills'}

From: ${recruiterName || 'Our Team'}`;

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
            name: "generate_email",
            description: "Generate personalized outreach email",
            parameters: {
              type: "object",
              properties: {
                subject: { type: "string", description: "Email subject line" },
                body: { type: "string", description: "Email body content" },
                personalization_notes: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "What was personalized in this email" 
                }
              },
              required: ["subject", "body"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_email" } }
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

    const email = JSON.parse(toolCall.function.arguments);
    console.log("Generated email:", email);

    return new Response(JSON.stringify(email), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Email generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
