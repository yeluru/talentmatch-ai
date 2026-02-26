import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const body = await req.json();
    const { jobTitle, jobDescription, skills } = body;

    if (!jobTitle) {
      return new Response(JSON.stringify({ error: "Missing jobTitle" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context from job and skills
    const coreSkills = Array.isArray(skills?.core) ? skills.core : [];
    const secondarySkills = Array.isArray(skills?.secondary) ? skills.secondary : [];
    const toolsSkills = Array.isArray(skills?.methods_tools) ? skills.methods_tools : [];
    const certs = Array.isArray(skills?.certs) ? skills.certs : [];

    const allSkills = [
      ...coreSkills.map((s: string) => `${s} (core)`),
      ...secondarySkills.map((s: string) => `${s} (secondary)`),
      ...toolsSkills.map((s: string) => `${s} (tool)`),
      ...certs.map((s: string) => `${s} (certification)`)
    ];

    const systemPrompt = `You are an expert recruiter who specializes in creating Google X-ray search queries for LinkedIn.

Your goal: Generate a highly effective LinkedIn search query that finds 20-50 RELEVANT candidates, not too broad (100s of irrelevant profiles) and not too narrow (only 2-5 results).

QUERY STRUCTURE RULES:
1. Always start with: site:linkedin.com/in
2. Use Boolean operators: AND (implied by space), OR (explicit), - (exclude)
3. Use quotes for exact phrases: "Security Engineer"
4. Create hierarchy with parentheses: (Engineer OR Architect OR Manager)

STRATEGY:
1. JOB TITLE (required): Create OR group of title variations
   - Example: ("Security Engineer" OR "Information Security Engineer" OR "Security Architect")
   - Remove seniority prefixes (Senior, Lead, etc.) to cast wider net
   - Include 2-4 common variations

2. PLATFORM/CORE TECH (required if cloud/platform role):
   - For AWS roles: Add "AWS" as required keyword
   - For Azure: Add "Azure"
   - For multi-cloud: Use OR group: (AWS OR Azure OR GCP)

3. SPECIALIZED SKILLS (OR group, 8-12 terms):
   - Pick 8-12 most specific, relevant skills from the list
   - Prioritize technical skills over soft skills
   - Example: (DevSecOps OR SIEM OR CSPM OR "Threat Modelling" OR IAM OR "API Security")

4. EXCLUSIONS (always include):
   - Standard: -recruiter -staffing -talent -sales -job -jobs -hiring -career
   - If AWS role: -"at Amazon" -"Amazon Web Services" (exclude current Amazon employees)
   - If Azure role: -"at Microsoft"
   - If GCP role: -"at Google"

AVOID:
- Generic soft skills (collaboration, communication, teamwork)
- Single generic words (network, data, storage, management)
- Putting 20+ skills in one OR group (too permissive)
- Requiring exact multi-word phrases with seniority (too restrictive)

EXAMPLES:

Bad (too permissive):
site:linkedin.com/in (AWS OR Security OR network OR data OR IAM OR... 30 terms) -recruiter
→ Matches CFOs, construction workers, anyone with "network"

Bad (too restrictive):
site:linkedin.com/in "Senior Information Security Architect" "AWS Certified" -recruiter
→ Only 5 results, misses "Security Engineer", "Cloud Security", etc.

Good (balanced):
site:linkedin.com/in ("Security Engineer" OR "Information Security Engineer" OR "Cloud Security Architect") AWS (DevSecOps OR SIEM OR CSPM OR "Threat Modelling" OR IAM OR "API Security" OR "Infrastructure security" OR CWPP) -recruiter -staffing -"at Amazon"
→ 20-50 relevant AWS security professionals

Return ONLY the query string, no explanation.`;

    // If user has curated skills, only use those (don't send job description to avoid LLM confusion)
    // If no skills provided, send job description for LLM to extract skills itself
    const userPrompt = `Job Title: ${jobTitle}

${allSkills.length > 0 ? `Skills to include (use ONLY these):\n${allSkills.join('\n')}\n\n` : ''}${allSkills.length === 0 && jobDescription ? `Job Description:\n${jobDescription}\n\n` : ''}Generate an optimal LinkedIn X-ray search query for this role.`;

    // Call LLM to generate query
    const { res, provider } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more consistent, focused output
      timeoutMs: 15000,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`AI provider error (${provider}):`, res.status, errorText);
      throw new Error(`AI provider returned ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    const query = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!query) {
      throw new Error("AI provider returned empty query");
    }

    console.log(`Generated query using ${provider}:`, query);

    return new Response(JSON.stringify({
      success: true,
      query,
      provider,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error generating query:", message);
    return new Response(JSON.stringify({
      success: false,
      error: message,
    }), {
      status: 200, // Return 200 to avoid triggering error handlers, error is in body
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
