import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clampList(items: unknown, max: number): string[] {
  const arr = Array.isArray(items) ? items : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function mapSeniorityToUi(v: unknown): "any" | "junior" | "mid" | "senior" | "staff" {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "any";
  if (s.includes("entry") || s.includes("junior") || s.includes("jr")) return "junior";
  if (s.includes("mid") || s.includes("intermediate")) return "mid";
  if (s.includes("staff") || s.includes("principal")) return "staff";
  if (s.includes("senior") || s.includes("sr") || s.includes("lead")) return "senior";
  return "any";
}

function quoteIfNeeded(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  // Skills/locations may include spaces or punctuation; quote those.
  if (/\s/.test(t) || /[():]/.test(t)) return `"${t.replace(/"/g, "")}"`;
  return t;
}

function buildXrayQuery(args: {
  titles: string[];
  skills: string[];
  locations: string[];
  seniority?: string;
}): string {
  const baseSite = "site:linkedin.com/in";
  const parts: string[] = [baseSite];

  // STRATEGY: Balanced approach - specific enough but not overly restrictive
  // Goal: 50-200 highly relevant results
  // Structure: Title variations + Required primary skill + Optional secondary skills

  // 1. TITLE VARIATIONS - Keep full phrases but offer alternatives
  // Use up to 2 title variations for flexibility
  if (args.titles.length > 0) {
    const titles = args.titles.slice(0, 2).map(t => {
      const clean = String(t).replace(/"/g, "").trim();
      // Remove seniority prefixes for broader matching
      const withoutSeniority = clean
        .replace(/^(Senior|Sr\.?|Junior|Jr\.?|Lead|Staff|Principal)\s+/i, '')
        .trim();
      return `"${withoutSeniority}"`;
    });
    if (titles.length === 1) {
      parts.push(titles[0]);
    } else {
      parts.push(`(${titles.join(" OR ")})`);
    }
  }

  // 2. PRIMARY SKILL - Required (most critical must-have)
  if (args.skills.length > 0) {
    parts.push(quoteIfNeeded(args.skills[0]));
  }

  // 3. SECONDARY SKILLS - Optional with OR (adds specificity without being too restrictive)
  if (args.skills.length > 1) {
    const secondarySkills = args.skills.slice(1, 3).map(s => quoteIfNeeded(s));
    if (secondarySkills.length > 0) {
      parts.push(`(${secondarySkills.join(" OR ")})`);
    }
  }

  // 4. LOCATION - Optional, state/country level only
  if (args.locations.length > 0) {
    const loc = String(args.locations[0]).replace(/"/g, "").trim();
    const statePart = loc.split(/[,•]/)[loc.includes(',') || loc.includes('•') ? 1 : 0]?.trim() || loc;
    const clean = statePart.replace(/\s*(USA?|United States.*)\s*/gi, '').trim();
    if (clean && clean.length >= 2) {
      parts.push(quoteIfNeeded(clean));
    }
  }

  // 5. EXCLUSIONS - Remove recruiter spam
  parts.push("-recruiter -staffing -talent -sales -job -jobs -hiring -career");

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const jdText = String(body?.jd_text ?? "").trim();
    const targetLocation = String(body?.target_location ?? "").trim();
    const seniorityOverride = String(body?.seniority ?? "").trim();
    const mustHaveSkills = clampList(body?.must_have_skills, 12);

    if (!jdText) {
      return new Response(JSON.stringify({ success: false, error: "Missing jd_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { res } = await callChatCompletions({
      messages: [
        {
          role: "system",
          content:
            "You extract structured signals from a Job Description to build a Google X-ray LinkedIn query.\n" +
            "STRATEGY: Broader is better. We want 50-200 results, not 0-2.\n" +
            "Return ONLY structured data. No commentary.\n\n" +
            "- titles: 2-3 role variations (e.g. 'Security Architect', 'Cloud Security Engineer')\n" +
            "- skills: TOP 3 MOST CRITICAL skills only (e.g. AWS, Security, Architecture). Prioritize must-have skills.\n" +
            "- locations: State/Country only, NO cities (e.g. 'Virginia', 'United States'). Max 2.\n" +
            "- seniority: one of [junior, mid, senior, staff] or null\n\n" +
            "Remember: Fewer, broader terms = more results. Choose the most essential, high-signal terms.",
        },
        { role: "user", content: `JD:\n${jdText.slice(0, 20000)}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_signals",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                titles: { type: "array", items: { type: "string" } },
                skills: { type: "array", items: { type: "string" } },
                locations: { type: "array", items: { type: "string" } },
                seniority: { type: ["string", "null"] },
              },
              required: ["titles", "skills", "locations"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_signals" } },
      temperature: 0.1,
      timeoutMs: 12_000,
    });

    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ success: false, error: `AI request failed (${res.status})`, details: t.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ success: false, error: "No tool output returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const titles = clampList(parsed?.titles, 2);  // Max 2 titles
    const skills = clampList(parsed?.skills, 3);  // Max 3 skills (changed from 12)
    const locations = clampList(parsed?.locations, 2);  // Max 2 locations (state/country)
    const seniority = mapSeniorityToUi(seniorityOverride || parsed?.seniority);

    // Merge user overrides (location + must-haves)
    const mergedLocations = targetLocation ? clampList([targetLocation, ...locations], 2) : locations;
    const mergedSkills = clampList([...mustHaveSkills, ...skills], 3);  // Max 3 total skills

    const query = buildXrayQuery({ titles, skills: mergedSkills, locations: mergedLocations, seniority });

    return new Response(
      JSON.stringify({
        success: true,
        query,
        extracted: {
          titles,
          skills: mergedSkills,
          locations: mergedLocations,
          seniority,
        },
        debug: {
          rules_used: ["max_2_titles", "max_3_skills", "max_2_locations", "broader_query_v2"],
          strategy: "Broader queries for 50-200 results instead of 0-2",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

