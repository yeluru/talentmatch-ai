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
    const { query, limit = 10 } = await req.json();
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured. Please connect Firecrawl in settings.");
    }
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are extracting professional profile information from LinkedIn page content. 
Extract the key details accurately. If a field is not found, leave it as null.`
              },
              {
                role: "user",
                content: `Extract profile information from this LinkedIn page content:

URL: ${result.url}
Title: ${result.title}

Content:
${result.markdown.substring(0, 15000)}`
              }
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
                        description: "List of skills mentioned"
                      },
                      experience_years: { type: "number", description: "Estimated years of experience" },
                      summary: { type: "string", description: "Brief professional summary" }
                    },
                    required: ["full_name"],
                    additionalProperties: false
                  }
                }
              }
            ],
            tool_choice: { type: "function", function: { name: "extract_profile" } }
          }),
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
