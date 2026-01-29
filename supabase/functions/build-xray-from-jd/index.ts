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
}): string {
  const baseSite = "(site:linkedin.com/in OR site:linkedin.com/pub)";

  const titlePart =
    args.titles.length > 0
      ? `(${args.titles.map((t) => `"${String(t).replace(/"/g, "").trim()}"`).filter(Boolean).join(" OR ")})`
      : "";

  const skillPart =
    args.skills.length > 0
      ? `(${args.skills.map((s) => quoteIfNeeded(s)).filter(Boolean).join(" OR ")})`
      : "";

  const locPart =
    args.locations.length > 0
      ? `(${args.locations.map((l) => `"${String(l).replace(/"/g, "").trim()}"`).filter(Boolean).join(" OR ")})`
      : "";

  // Keep this aligned with the local google-x-ray project defaults.
  const exclusions = "-jobs -job -recruiter -hiring -learning -articles -pulse -groups -careers";

  return [baseSite, titlePart, skillPart, locPart, exclusions]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
            "Return ONLY structured data. Do not add commentary.\n" +
            "- titles: max 3\n" +
            "- skills: max 12\n" +
            "- locations: max 3 (GEOGRAPHIC ONLY; city/state/metro/country). Do NOT include remote/on-site/hybrid.\n" +
            "- seniority: one of [Junior, Mid, Senior, Staff/Principal] or null\n",
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
    const titles = clampList(parsed?.titles, 3);
    const skills = clampList(parsed?.skills, 12);
    const locations = clampList(parsed?.locations, 3);
    const seniority = mapSeniorityToUi(seniorityOverride || parsed?.seniority);

    // Merge user overrides (location + must-haves)
    const mergedLocations = targetLocation ? clampList([targetLocation, ...locations], 3) : locations;
    const mergedSkills = clampList([...mustHaveSkills, ...skills], 12);

    const query = buildXrayQuery({ titles, skills: mergedSkills, locations: mergedLocations });

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
          rules_used: ["max_3_titles", "max_12_skills", "max_3_locations", "xray_format_v1"],
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

