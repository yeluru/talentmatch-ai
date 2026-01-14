import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExtractedLocation = {
  site: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type JobType = "Onsite" | "Hybrid" | "Remote" | "Unknown";

type ExperienceLevel =
  | "Entry"
  | "Mid"
  | "Senior"
  | "Lead"
  | "Principal/Architect"
  | "Manager"
  | "Director"
  | "Unknown";

type ExtractedSkills = {
  core: string[];
  secondary: string[];
  methods_tools: string[];
  certs: string[];
};

type ParsedJob = {
  title: string | null;
  location: ExtractedLocation;
  job_type: JobType;
  experience_level: ExperienceLevel;
  skills: ExtractedSkills;
  jd: string;
  extraction_notes: string[];
  internal_notes: string | null;
};

function clampStr(s: unknown, maxLen: number) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function stripVendorLines(raw: string) {
  const lines = raw.split("\n").map((l) => l.trim());
  const kept: string[] = [];
  const removed: string[] = [];

  for (const l of lines) {
    const line = l.trim();
    if (!line) continue;

    const isVendor =
      /^client\s*:/i.test(line) ||
      /^vendor\s*:/i.test(line) ||
      /^work\s+location\s*:/i.test(line) ||
      /^location\s*:/i.test(line) ||
      /^remote\s*:/i.test(line) ||
      /^rate\s*:/i.test(line) ||
      /^submission\s+deadline\s*:/i.test(line) ||
      /^req(?:uisition)?\s*id\s*:/i.test(line) ||
      /^job\s*id\s*:/i.test(line) ||
      /^fnmajp\d+/i.test(line) ||
      // Common codes like "ABC12345/ABC12346"
      /^[A-Z]{3,}\d{3,}(?:\/[A-Z]{3,}\d{3,})+/.test(line);

    if (isVendor) removed.push(line);
    else kept.push(line);
  }

  return { kept, removed };
}

function dedupeParagraphs(lines: string[]) {
  const paras = lines.join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paras) {
    const key = p.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join("\n\n");
}

function cleanedJdFromRaw(raw: string) {
  const { kept } = stripVendorLines(raw);
  // Normalize section formatting: put headings on their own line and keep bullets line-by-line.
  const normalized: string[] = [];
  for (const line of kept) {
    const l = line.trim();
    if (!l) continue;
    // Ensure section headings are separated
    if (/^(requirements|responsibilities|qualifications|required qualifications|preferred qualifications|certifications|soft skills)\b/i.test(l)) {
      normalized.push(l.replace(/\s*:\s*$/, ":"));
      continue;
    }
    // Keep bullet lines as-is
    if (/^[•\-\u2022]/.test(l)) {
      normalized.push(l);
      continue;
    }
    // Split "Heading: bullet bullet" style lines into separate lines if obvious
    normalized.push(l);
  }

  let cleaned = dedupeParagraphs(normalized);

  // Split inline bullets, e.g. "Responsibilities: • A • B" -> heading + bullet lines.
  cleaned = cleaned.replace(/:\s*[•\u2022]/g, ":\n•");
  cleaned = cleaned.replace(/\s+[•\u2022]\s+/g, "\n• ");

  // Remove vendor-y phrasing (preserve newlines)
  cleaned = cleaned.replace(/\bthe client is seeking\b/gi, "We are seeking");

  // Clean up spacing per-line (do NOT collapse newlines)
  cleaned = cleaned
    .split("\n")
    .map((ln) => ln.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();

  // Aggressive whole-block dedupe: if the JD body is repeated, keep only the first occurrence.
  // Detect by looking for a repeated anchor paragraph.
  const canon = cleaned.toLowerCase();
  const anchor = canon.slice(0, Math.min(300, canon.length));
  const idx = canon.indexOf(anchor, 350);
  if (idx > 0) {
    // If most of the remainder looks like a repeat, truncate at idx.
    const head = canon.slice(0, idx).trim();
    const tail = canon.slice(idx).trim();
    if (tail.length > 200 && head.includes(tail.slice(0, 120))) {
      cleaned = cleaned.slice(0, idx).trim();
    }
  }

  // Re-insert blank lines before headings for readability in whitespace-pre-wrap render.
  cleaned = cleaned.replace(/\n?(Requirements:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Responsibilities:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Qualifications:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Required Qualifications:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Preferred Qualifications:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Certifications\b.*:)/gi, "\n\n$1");
  cleaned = cleaned.replace(/\n?(Soft Skills\b.*:)/gi, "\n\n$1");

  return clampStr(cleaned, 8000) || "";
}

function internalNotesFromRaw(raw: string) {
  const { removed } = stripVendorLines(raw);
  return clampStr(removed.join("\n"), 2000);
}

function uniqSkills(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 30) break;
  }
  return out;
}

function normalizeJobType(v: unknown, rawText: string): JobType {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  const raw = rawText.toLowerCase();

  // Critical rule: Remote: No + Hybrid => Hybrid
  if (/remote\s*:\s*no/i.test(rawText) && /\bhybrid\b/i.test(rawText)) return "Hybrid";

  if (s.includes("hybrid")) return "Hybrid";
  if (s.includes("onsite") || s.includes("on-site") || s.includes("in-person") || s.includes("in person")) return "Onsite";
  if (s.includes("remote")) return "Remote";

  if (/\bhybrid\b/.test(raw)) return "Hybrid";
  if (/\bremote\b/.test(raw)) return "Remote";
  if (/\bonsite\b|\bon-site\b|\bin-person\b|\bin person\b/.test(raw)) return "Onsite";
  return "Unknown";
}

function normalizeExperience(v: unknown): ExperienceLevel {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.includes("principal") || s.includes("architect")) return "Principal/Architect";
  if (s.includes("director")) return "Director";
  if (s.includes("manager")) return "Manager";
  if (s.includes("lead")) return "Lead";
  if (s.includes("senior")) return "Senior";
  if (s.includes("mid")) return "Mid";
  if (s.includes("entry") || s.includes("junior")) return "Entry";
  if (s.includes("unknown")) return "Unknown";
  return "Unknown";
}

function inferExperienceFromText(rawText: string): ExperienceLevel {
  const t = rawText.toLowerCase();
  const m = t.match(/(\d{1,2})\+?\s*years/);
  const years = m ? Number(m[1]) : null;
  if (typeof years === "number" && Number.isFinite(years)) {
    if (years <= 2) return "Entry";
    if (years <= 5) return "Mid";
    if (years <= 9) return "Senior";
    if (years >= 10) return "Lead";
  }
  if (t.includes("specialized developer v") || t.includes("developer v")) return "Lead";
  if (t.includes("principal") || t.includes("architect")) return "Principal/Architect";
  if (t.includes("director")) return "Director";
  if (t.includes("manager")) return "Manager";
  if (t.includes("lead")) return "Lead";
  if (t.includes("senior")) return "Senior";
  if (t.includes("mid")) return "Mid";
  if (t.includes("entry") || t.includes("junior")) return "Entry";
  return "Unknown";
}

function extractLocationHeuristic(rawText: string): ExtractedLocation {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const locLine = lines.find((l) => /^work\s+location[:\s]/i.test(l) || /^location[:\s]/i.test(l));
  const siteRaw = locLine
    ? locLine.replace(/^work\s+location[:\s]*/i, "").replace(/^location[:\s]*/i, "").trim()
    : "";

  const site = clampStr(siteRaw || null, 120);

  // If the site is like "City, ST", capture city/state.
  let city: string | null = null;
  let state: string | null = null;
  if (siteRaw) {
    const m = siteRaw.match(/^\s*([^,]+)\s*,\s*([A-Z]{2})\s*$/);
    if (m) {
      city = clampStr(m[1], 80);
      state = clampStr(m[2], 10);
    }
  }

  return { site, city, state, country: null };
}

function heuristicSkills(rawText: string): ExtractedSkills {
  const t = rawText;
  const found = (arr: string[]) =>
    arr
      .filter((k) => new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i").test(t))
      .map((s) => (s === "Lightning Web Components" ? "LWC" : s))
      .map((s) => (s === "Integration Hub" ? "ServiceNow Integration Hub" : s));

  const coreCandidates = [
    "ServiceNow",
    "Salesforce",
    "Apex",
    "Visualforce",
    "Lightning Web Components",
    "LWC",
    "SOQL",
    "SOSL",
    "GlideRecord",
    "GRC",
    "Integration Hub",
    "REST",
    "SOAP",
    "OAuth",
    "JavaScript",
    "Ajax",
    "XML",
    "JSON",
    "HTML",
    "CSS",
  ];

  const methodsToolsCandidates = [
    "Agile",
    "Scrum",
    "CI/CD",
    "Git",
    "Jenkins",
    "Salesforce DX",
    "SFDX",
  ];

  const certCandidates = [
    "Salesforce Platform Developer I",
    "Salesforce Platform Developer II",
    "Salesforce Application Architect",
    "Salesforce System Architect",
    "Salesforce Certified Integration Architecture Designer",
    "Salesforce Certified JavaScript Developer I",
    "Certified ServiceNow Application Developer",
    "Certified Implementation Specialist Risk and Compliance",
  ];

  return {
    core: uniqSkills(found(coreCandidates)),
    secondary: [],
    methods_tools: uniqSkills(found(methodsToolsCandidates)),
    certs: uniqSkills(found(certCandidates)),
  };
}

function heuristicParse(text: string): ParsedJob {
  const raw = text.trim();
  const mTitle =
    raw.match(/seeking a\s+([^.\n]+?)(?:\s+to\s+|\.)/i) ||
    raw.match(/job\s+description\s*:\s*\n\s*([^\n.]{3,120})/i) ||
    raw.match(/\bRole\s*[:\-]\s*([^\n]+)\n/i) ||
    raw.match(/\bTitle\s*[:\-]\s*([^\n]+)\n/i);
  const title = clampStr(mTitle?.[1] ?? null, 120);

  const location = extractLocationHeuristic(raw);
  const job_type = normalizeJobType(null, raw);
  const experience_level = inferExperienceFromText(raw);
  const skills = heuristicSkills(raw);
  const jd = cleanedJdFromRaw(raw);
  const internal_notes = internalNotesFromRaw(raw);
  const extraction_notes: string[] = [];

  if (!location.site) extraction_notes.push("Location not found in text; set to null.");
  if (job_type === "Unknown") extraction_notes.push("Work mode not found; set to Unknown.");
  if (experience_level === "Unknown") extraction_notes.push("Experience level not found; set to Unknown.");

  if (!title) extraction_notes.push("Title not found in text; please enter manually.");

  return { title, location, job_type, experience_level, skills, jd, extraction_notes, internal_notes };
}

function sanitizeAiPayload(x: any, rawText: string): ParsedJob {
  const loc = x?.location || {};
  const location: ExtractedLocation = {
    site: clampStr(loc?.site, 120),
    city: clampStr(loc?.city, 120),
    state: clampStr(loc?.state, 120),
    country: clampStr(loc?.country, 120),
  };

  const skills: ExtractedSkills = {
    core: uniqSkills(x?.skills?.core),
    secondary: uniqSkills(x?.skills?.secondary),
    methods_tools: uniqSkills(x?.skills?.methods_tools),
    certs: uniqSkills(x?.skills?.certs),
  };

  return {
    title: clampStr(x?.title, 120),
    location,
    job_type: normalizeJobType(x?.job_type, rawText),
    experience_level: normalizeExperience(x?.experience_level) || inferExperienceFromText(rawText),
    skills,
    jd: clampStr(x?.jd, 8000) ?? cleanedJdFromRaw(rawText),
    extraction_notes: Array.isArray(x?.extraction_notes)
      ? x.extraction_notes.filter((v: any) => typeof v === "string").slice(0, 12)
      : [],
    internal_notes: clampStr(x?.internal_notes, 2000) ?? internalNotesFromRaw(rawText),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text } = await req.json();
    const jdText = typeof text === "string" ? text.trim() : "";
    if (!jdText) {
      return new Response(JSON.stringify({ error: "Missing job description text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try LLM extraction; fall back to heuristics if no provider configured or LLM fails.
    try {
      const systemPrompt = `You are an information extraction + JD normalization engine.

Goal:
Given a raw job description (often containing vendor notes like client, rate, deadline, req id, etc.), you must:
1) Extract ONLY these fields: location, job_type, experience_level, skills
2) Remove everything else (client name, rate, submission deadline, req ids, recruiter notes, duplicated JD blocks, etc.)
3) Rewrite the remaining JD content into a clean, readable "jd" field with no vendor metadata.
4) Never leave extracted fields empty if the information exists anywhere in the text. If truly missing, use null and explain why in "extraction_notes".

Critical rules:
- Do NOT output: client, rate, submission deadline, req id, vendor name, pay range, contact info.
- If the JD is duplicated, dedupe and keep one clean version.
- If "Remote: No (Hybrid 3 days in-person, 2 days remote)" is present, job_type MUST be "Hybrid".
- Experience level must be one of: ["Entry","Mid","Senior","Lead","Principal/Architect","Manager","Director","Unknown"].
- job_type must be one of: ["Onsite","Hybrid","Remote","Unknown"].
- Skills must be deduped and categorized: core, secondary, methods_tools, certs.`;

      const userPrompt = `Now process the following raw input exactly:\n\n<<<RAW_JD\n${jdText}\nRAW_JD>>>`;

      const { res } = await callChatCompletions({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_job_fields",
              description: "Extract structured job fields from a job description blurb",
              parameters: {
                type: "object",
                properties: {
                  title: { type: ["string", "null"] },
                  job_type: { type: ["string", "null"] },
                  experience_level: { type: ["string", "null"] },
                  location: {
                    type: "object",
                    properties: {
                      site: { type: ["string", "null"] },
                      city: { type: ["string", "null"] },
                      state: { type: ["string", "null"] },
                      country: { type: ["string", "null"] },
                    },
                  },
                  skills: {
                    type: "object",
                    properties: {
                      core: { type: "array", items: { type: "string" } },
                      secondary: { type: "array", items: { type: "string" } },
                      methods_tools: { type: "array", items: { type: "string" } },
                      certs: { type: "array", items: { type: "string" } },
                    },
                    required: ["core", "secondary", "methods_tools", "certs"],
                  },
                  jd: { type: "string" },
                  extraction_notes: { type: "array", items: { type: "string" } },
                },
                required: ["title", "location", "job_type", "experience_level", "skills", "jd", "extraction_notes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_job_fields" } },
      });

      if (!res.ok) {
        throw new Error(`AI gateway error: ${res.status}`);
      }

      const data = await res.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call in response");

      const parsed = JSON.parse(toolCall.function.arguments);
      const normalized = sanitizeAiPayload(parsed, jdText);
      return new Response(JSON.stringify({ parsed: normalized, source: "llm" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      const fallback = heuristicParse(jdText);
      return new Response(JSON.stringify({ parsed: fallback, source: "heuristic" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

