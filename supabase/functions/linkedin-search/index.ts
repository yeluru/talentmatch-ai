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

    // Verify user has recruiter role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['recruiter', 'account_manager'])
      .maybeSingle();

    if (!userRole) {
      console.error("User doesn't have required role for LinkedIn search");
      return new Response(JSON.stringify({ error: "Forbidden - requires recruiter or manager role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id, "Role:", userRole.role);

    const { query, limit = 10 } = await req.json();
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured. Please connect Firecrawl in settings.");
    }

    console.log("Searching for profiles with query:", query);

    // Use Firecrawl's search API to find LinkedIn profiles
    const searchQuery = `site:linkedin.com/in ${query}`;
    
    const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: limit,
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("Firecrawl search error:", searchResponse.status, errorText);
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log("Search returned", searchData.data?.length || 0, "results");

    if (!searchData.success || !searchData.data?.length) {
      return new Response(JSON.stringify({ 
        success: true, 
        profiles: [],
        message: "No profiles found for this search query"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse each result using AI to extract profile data
    const profiles = [];

    for (const result of searchData.data.slice(0, limit)) {
      if (!result.markdown || result.markdown.length < 100) continue;

      try {
        const { res: aiResponse } = await callChatCompletions({
          messages: [
            {
              role: "system",
              content: `You are extracting professional profile information from LinkedIn page content.
Extract the key details accurately. If a field is not found, leave it as null.`,
            },
            {
              role: "user",
              content: `Extract profile information from this LinkedIn page content:

URL: ${result.url}
Title: ${result.title}

Content:
${result.markdown.substring(0, 15000)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_profile",
                description: "Extract structured profile data from LinkedIn content",
                parameters: {
                  type: "object",
                  properties: {
                    full_name: { type: "string", description: "Person's full name" },
                    headline: { type: "string", description: "Professional headline/title" },
                    current_company: { type: "string", description: "Current employer" },
                    location: { type: "string", description: "Geographic location" },
                    skills: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of skills mentioned",
                    },
                    experience_years: {
                      type: "number",
                      description: "Estimated years of experience",
                    },
                    summary: { type: "string", description: "Brief professional summary" },
                  },
                  required: ["full_name"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_profile" } },
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const profile = JSON.parse(toolCall.function.arguments);
            profiles.push({
              ...profile,
              linkedin_url: result.url,
              source: "linkedin_search"
            });
          }
        }
      } catch (e) {
        console.error("Error parsing profile:", e);
      }
    }

    console.log("Successfully parsed", profiles.length, "profiles");

    return new Response(JSON.stringify({ 
      success: true, 
      profiles,
      total_found: searchData.data.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("linkedin-search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
