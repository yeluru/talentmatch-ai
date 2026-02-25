import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toIlikeOr(parts: string[], column: string) {
  const cleaned = parts
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .slice(0, 3); // Limit to 3 skills to prevent timeout
  if (!cleaned.length) return "";
  // PostgREST .or() format: "col.ilike.%foo%,col.ilike.%bar%"
  return cleaned
    .map((p) => `${column}.ilike.%${p.replaceAll("%", "").replaceAll(",", " ")}%`)
    .join(",");
}

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

    const body = await req.json();
    const searchQuery = body?.searchQuery;
    const candidates = body?.candidates;
    const organizationId = body?.organizationId;
    const structuredSearch = body?.structuredSearch; // From "Search by Job" mode
    const strictMode = Boolean(body?.strictMode); // Must have ALL skills (Free Text only)
    const prefilterLimit = Number(body?.prefilterLimit || 200);
    const topN = Number(body?.topN || 30);

    console.log("Talent search query:", searchQuery);
    console.log("Structured search:", structuredSearch ? "Yes (skip AI parsing)" : "No");
    if (structuredSearch) {
      console.log("Structured data:", JSON.stringify(structuredSearch));
    }
    console.log("Candidates provided:", Array.isArray(candidates) ? candidates.length : 0);
    console.log("Organization:", organizationId || "n/a");

    if (!searchQuery || typeof searchQuery !== "string") {
      return new Response(JSON.stringify({ error: "Missing searchQuery" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ----------------------------
    // SEARCH BY JOB: Create async search job
    // ----------------------------
    if (structuredSearch) {
      console.log("Search by Job mode - creating async search job");

      // Create search job record
      const { data: searchJob, error: createErr } = await supabase
        .from('talent_search_jobs')
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          job_id: structuredSearch.jobId,
          search_query: searchQuery,
          status: 'pending'
        })
        .select()
        .single();

      if (createErr || !searchJob) {
        throw new Error("Failed to create search job");
      }

      console.log("Created search job:", searchJob.id);

      // Trigger background processor using service role for reliability
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      // Use fetch directly instead of supabase.functions.invoke (more reliable)
      const processorUrl = `${supabaseUrl}/functions/v1/process-talent-search-job`;

      fetch(processorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ searchJobId: searchJob.id })
      }).then(res => {
        if (res.ok) {
          console.log("Background processor triggered successfully");
        } else {
          console.error("Processor invocation failed:", res.status, res.statusText);
        }
      }).catch(err => {
        console.error("Failed to trigger processor:", err);
      });

      // Return immediately with job ID
      return new Response(JSON.stringify({
        searchJobId: searchJob.id,
        status: 'pending',
        message: 'Search job created. Processing in background.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ----------------------------
    // FREE TEXT SEARCH: Synchronous with simple ranking
    // ----------------------------
    let parsedQuery: any = {};

    if (true) { // Free text mode
      // Free text search - use AI to parse
      console.log("Parsing free text query with AI");
      const parseSystem =
        `You are an expert recruiter assistant. Extract structured filters from a natural language candidate search query.\n` +
        `Return concise values. Keep skills normalized (e.g. "react", "typescript", "postgres").`;

      const { res: parseRes } = await callChatCompletions({
        messages: [
          { role: "system", content: parseSystem },
          { role: "user", content: `Query: "${searchQuery}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_query",
              description: "Parse a talent search query into structured filters",
              parameters: {
                type: "object",
                properties: {
                  role: { type: "string" },
                  location: { type: "string" },
                  experience_level: { type: "string" },
                  skills: { type: "array", items: { type: "string" } },
                  industry: { type: "string" },
                },
                required: [],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_query" } },
        temperature: 0.1,
        timeoutMs: 20000,
      });

      if (!parseRes.ok) {
        const t = await parseRes.text();
        console.error("Parse error:", parseRes.status, t);
        throw new Error(`AI parse error: ${parseRes.status}`);
      }

      const parseJson = await parseRes.json();
      const parseToolCall = parseJson.choices?.[0]?.message?.tool_calls?.[0];
      parsedQuery = parseToolCall?.function?.arguments
        ? JSON.parse(parseToolCall.function.arguments)
        : {};
    }

    // ----------------------------
    // 2) Prefilter candidates in DB (FAST - no complex queries)
    // ----------------------------
    let candidatesToRank: any[] = [];

    // For Free Text: Skip complex skill queries, just get org candidates
    const skipSkillFiltering = true;

    if (Array.isArray(candidates) && candidates.length > 0) {
      // Backwards compatible path (small orgs only)
      candidatesToRank = candidates;
    } else {
      if (!organizationId) {
        return new Response(JSON.stringify({ error: "Missing organizationId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const skills = Array.isArray(parsedQuery?.skills) ? parsedQuery.skills : [];
      const role = String(parsedQuery?.role || "").trim();
      const location = String(parsedQuery?.location || "").trim();

      let candidateIds: string[] = [];

      if (skills.length && !skipSkillFiltering) {
        if (strictMode) {
          // STRICT MODE: Candidate must have ALL skills (AND logic)
          console.log("Using strict mode - candidate must have ALL skills");

          // Get candidates for each skill, then find intersection
          const skillCandidateSets: Set<string>[] = [];

          for (const skill of skills) {
            const { data: skillRows, error: skillErr } = await supabase
              .from("candidate_skills")
              .select("candidate_id")
              .ilike("skill_name", `%${skill}%`)
              .limit(1000); // Reduced from 5000 to prevent timeout

            if (skillErr) throw skillErr;

            const candidatesWithThisSkill = new Set(
              (skillRows || []).map((r: any) => r?.candidate_id).filter(Boolean)
            );
            skillCandidateSets.push(candidatesWithThisSkill);
          }

          // Find intersection - candidates that have ALL skills
          if (skillCandidateSets.length > 0) {
            let intersection = skillCandidateSets[0];
            for (let i = 1; i < skillCandidateSets.length; i++) {
              intersection = new Set([...intersection].filter(x => skillCandidateSets[i].has(x)));
            }

            const skillIds = Array.from(intersection).slice(0, 5000);
            console.log(`Strict mode: ${skillIds.length} candidates have ALL ${skills.length} skills`);

            if (skillIds.length) {
              const { data: linkRows, error: linkErr } = await supabase
                .from("candidate_org_links")
                .select("candidate_id")
                .eq("organization_id", organizationId)
                .eq("status", "active")
                .in("candidate_id", skillIds)
                .limit(Math.max(50, prefilterLimit));
              if (linkErr) throw linkErr;
              candidateIds = Array.from(
                new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
              );
            }
          }
        } else {
          // NORMAL MODE: Candidate can have ANY skills (OR logic)
          const skillsOr = toIlikeOr(skills, "skill_name");
          const { data: skillRows, error: skillErr } = await supabase
            .from("candidate_skills")
            .select("candidate_id")
            .or(skillsOr)
            .limit(1000); // Reduced from 5000 to prevent timeout
          if (skillErr) throw skillErr;
          const skillIds = Array.from(
            new Set((skillRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
          ).slice(0, 5000);

          if (skillIds.length) {
            const { data: linkRows, error: linkErr } = await supabase
              .from("candidate_org_links")
              .select("candidate_id")
              .eq("organization_id", organizationId)
              .eq("status", "active")
              .in("candidate_id", skillIds)
              .limit(Math.max(50, prefilterLimit));
            if (linkErr) throw linkErr;
            candidateIds = Array.from(
              new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
            );
          }
        }
      } else {
        let q = supabase
          .from("candidate_org_links")
          .select(
            `candidate_id,
             candidate_profiles(
               id,
               full_name,
               email,
               location,
               current_title,
               years_of_experience,
               summary,
               desired_locations
             )`,
          )
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .limit(Math.max(50, prefilterLimit));

        if (role) q = q.ilike("candidate_profiles.current_title", `%${role}%`);
        if (location) q = q.ilike("candidate_profiles.location", `%${location}%`);

        const { data: linkRows, error: linkErr } = await q;
        if (linkErr) throw linkErr;
        candidateIds = Array.from(
          new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
        );
      }

      // Fallback: if filters are too strict, take recent org-linked candidates (still capped)
      if (!candidateIds.length) {
        const { data: linkRows, error: linkErr } = await supabase
          .from("candidate_org_links")
          .select("candidate_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(Math.max(50, prefilterLimit));
        if (linkErr) throw linkErr;
        candidateIds = Array.from(
          new Set((linkRows || []).map((r: any) => r?.candidate_id).filter(Boolean)),
        );
      }

      if (!candidateIds.length) {
        return new Response(JSON.stringify({ parsed_query: parsedQuery, matches: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const idsCapped = candidateIds.slice(0, Math.max(50, prefilterLimit));
      const { data: profiles, error: profErr } = await supabase
        .from("candidate_profiles")
        .select(
          `
          id,
          full_name,
          email,
          location,
          current_title,
          years_of_experience,
          summary,
          desired_locations,
          candidate_skills(skill_name)
        `,
        )
        .in("id", idsCapped);
      if (profErr) throw profErr;

      candidatesToRank = (profiles || []).map((p: any) => {
        const name =
          p.full_name || (p.email ? String(p.email).split("@")[0] : "") || "Candidate";
        const loc =
          p.location ||
          (Array.isArray(p.desired_locations) ? p.desired_locations[0] : null) ||
          null;
        const skills = (p.candidate_skills || []).map((s: any) => s?.skill_name).filter(Boolean);
        return {
          id: p.id,
          name,
          title: p.current_title,
          years_experience: p.years_of_experience,
          summary: p.summary,
          location: loc,
          skills,
        };
      });
    }

    console.log("Candidates found:", candidatesToRank.length);

    // ----------------------------
    // 3) Simple sorting (no AI ranking for Phase 1)
    // ----------------------------
    // Sort by skill match count (candidates with more matching skills rank higher)
    const searchSkills = (parsedQuery?.skills || []).map((s: string) => s.toLowerCase());

    const candidatesWithScores = candidatesToRank.map((c: any) => {
      const candidateSkills = (c.skills || []).map((s: string) => s.toLowerCase());
      const matchCount = searchSkills.filter((skill: string) =>
        candidateSkills.some((cs: string) => cs.includes(skill) || skill.includes(cs))
      ).length;

      // Normalize to 0-100 scale
      const totalSearchSkills = Math.max(searchSkills.length, 1);
      const skillMatchPercent = (matchCount / totalSearchSkills) * 80; // 80% weight
      const experiencePercent = Math.min((c.years_experience || 0) / 20, 1) * 20; // 20% weight
      const normalizedScore = Math.round(skillMatchPercent + experiencePercent);

      return {
        ...c,
        skill_match_count: matchCount,
        match_score: normalizedScore
      };
    });

    // Sort by match score (descending)
    candidatesWithScores.sort((a, b) => b.match_score - a.match_score);

    // Return top results (cap at 500 for Free Text, all for others)
    const topCandidates = candidatesWithScores.slice(0, Math.min(500, candidatesWithScores.length));

    console.log(`Returning ${topCandidates.length} candidates (sorted by skill match)`);

    // Format results for frontend (no AI ranking needed)
    const matches = topCandidates.map((c: any, index: number) => ({
      candidate_index: index + 1,
      candidate_id: c.id,
      candidate: c,
      match_score: c.match_score,
      match_reason: `${c.skill_match_count} matching skills`,
      matched_criteria: searchSkills.slice(0, 5),
      missing_criteria: []
    }));

    const result = {
      parsed_query: parsedQuery || {},
      matches,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Talent search error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
