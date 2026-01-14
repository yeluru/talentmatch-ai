import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_RESUME_TEXT_LENGTH = 100000; // 100KB
const MAX_JOB_DESCRIPTION_LENGTH = 50000; // 50KB

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength).replace(/[<>]/g, '');
}

function normForMatch(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJdForKeywordExtraction(jd: string) {
  // Many users paste JDs as one long paragraph with "•" bullets and inline headings.
  // Normalize into line-like chunks so deterministic extraction works reliably.
  let t = String(jd || "");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Turn inline bullets into their own lines
  t = t.replace(/[•\u2022]/g, "\n• ");
  // Put common headings on their own line
  t = t.replace(
    /\b(Key Responsibilities|Responsibilities|Required Qualifications|Preferred Qualifications|Qualifications|Requirements|Soft Skills)\s*:\s*/gi,
    "\n$1:\n",
  );
  // Avoid huge single lines
  t = t.replace(/\. +/g, ".\n");
  // Collapse excessive newlines
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}

function extractJdKeywordsDeterministic(jd: string) {
  const text = normalizeJdForKeywordExtraction(String(jd || ""));
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // We want *true* ATS terms (tools, acronyms, certs, short requirement phrases),
  // not long sentences that artificially inflate the denominator.
  const candidates: string[] = [];

  // 1) Pull explicit parenthetical acronyms: "Lightning Web Components (LWC)" -> both phrases.
  const paren = [...text.matchAll(/([A-Za-z][A-Za-z0-9 &\/.-]{2,80})\s*\(\s*([A-Z0-9]{2,10})\s*\)/g)];
  for (const m of paren) {
    const full = String(m[1] || "").trim();
    const abbr = String(m[2] || "").trim();
    if (full) candidates.push(full);
    if (abbr) candidates.push(abbr);
  }

  // 2) Pull token-like ATS terms from the JD: acronyms, slash terms, tech-ish tokens.
  // Examples: CI/CD, SOQL/SOSL, REST/SOAP, Salesforce DX, OAuth, WebSphere, Informatica.
  const tokenTerms = [
    ...text.matchAll(/\b[A-Z]{2,}(?:\/[A-Z]{2,})+\b/g), // SOQL/SOSL, REST/SOAP
    ...text.matchAll(/\b[A-Z]{2,}\/[A-Z]{2,}\b/g), // CI/CD
  ].map((m) => String((m as any)[0] || "").trim());
  candidates.push(...tokenTerms);

  // 3) From bullet-like requirement lines, keep short, meaningful fragments.
  const hotHeadings = /(REQUIREMENTS|QUALIFICATIONS|RESPONSIBILITIES|CERTIFICATIONS|SOFT SKILLS)/i;
  let inHot = false;
  for (const l0 of lines) {
    if (hotHeadings.test(l0)) {
      inHot = true;
      continue;
    }
    const isBullet = /^[•\-\*]/.test(l0);
    if (!inHot && !isBullet) continue;
    const l = l0.replace(/^[•\-\*]+\s*/, "").trim();
    if (!l) continue;

    // Split and keep fragments <= 6 words (to avoid long sentences).
    for (const part of l.split(/[,;]|•|\band\b|\bor\b/gi)) {
      const s = part.trim().replace(/\s+/g, " ");
      if (!s) continue;
      const words = s.split(" ").filter(Boolean);
      if (words.length > 6) continue;
      if (s.length < 2 || s.length > 70) continue;
      candidates.push(s);
    }
  }

  // 4) Filter out boilerplate / low-signal soft sentences that distort the score.
  const badStarts = [
    "ability to",
    "excellent",
    "strong",
    "be flexible",
    "adapt to",
    "you pride yourself",
    "you",
    "proficiency",
    "familiarity",
    "highly preferred",
    "additional job",
    "additional job responsibilities",
    "leverage",
    "assure",
    "conducts",
    "some",
    "seeking",
    "qualifications",
    "responsibilities",
    "requirements",
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const cleaned = String(raw || "")
      .replace(/^[•\-\*]+\s*/, "")
      .replace(/[.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (badStarts.some((p) => lower.startsWith(p))) continue;
    // Avoid generic single words that don't help a checklist
    if (lower.length < 3) continue;
    if (["experience", "skills", "requirements", "qualifications", "responsibilities"].includes(lower)) continue;
    const key = normForMatch(cleaned);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  // Cap the denominator so coverage isn't artificially diluted by a huge term list.
  return out.slice(0, 60);
}

function keywordCoverageScore(resumeText: string, jdText: string) {
  const resume = normForMatch(resumeText);
  const kws = extractJdKeywordsDeterministic(jdText);
  const matched: string[] = [];
  const missing: string[] = [];

  const variants = (k: string) => {
    const base = normForMatch(k);
    if (!base) return [];
    const vs = new Set<string>([base]);
    // Handle slash terms (soql/sosl)
    if (k.includes("/")) {
      for (const part of k.split("/")) {
        const p = normForMatch(part);
        if (p) vs.add(p);
      }
    }
    // Common formatting variants
    vs.add(base.replace(/\s+/g, "")); // Visualforce vs visual force
    vs.add(base.replace(/\s+/g, " ")); // normalize spaces
    // Common aliases for ATS terms
    if (base === "visualforce") vs.add("visual force");
    if (base === "ci cd" || base === "ci/cd") {
      vs.add("ci cd");
      vs.add("ci/cd");
    }
    if (base === "salesforce dx") vs.add("sfdx");
    if (base === "lightning web components") vs.add("lwc");
    if (base === "soql") vs.add("soql");
    if (base === "sosl") vs.add("sosl");
    if (base === "soql sosl") {
      vs.add("soql");
      vs.add("sosl");
    }
    return [...vs].filter(Boolean);
  };

  const has = (k: string) => {
    for (const v of variants(k)) {
      if (resume.includes(v)) return true;
    }
    return false;
  };

  for (const k of kws) {
    if (has(k)) matched.push(k);
    else missing.push(k);
  }

  const total = kws.length || 1;
  const score = Math.round((matched.length / total) * 100);
  return { score: Math.min(100, Math.max(0, score)), total, matched_count: matched.length, matched, missing };
}

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

    const body = await req.json();

    // Input validation
    const resumeText = sanitizeString(body.resumeText, MAX_RESUME_TEXT_LENGTH);
    const jobDescription = sanitizeString(body.jobDescription, MAX_JOB_DESCRIPTION_LENGTH);

    if (!resumeText || resumeText.length < 50) {
      return new Response(JSON.stringify({ error: "Resume text is required and must be at least 50 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

const systemPrompt = `You are an ACCURATE and FAIR resume-to-JD matcher for MatchTalent AI.

IMPORTANT: In this product, "match_score" is an ATS-style keyword alignment score (shortlisting likelihood),
NOT a hiring-qualification score. The goal is to measure how well the resume text matches the JD text for ATS scanning.

CRITICAL MATCHING RULES:
1) Be role-aware: evaluate the JD at the level it is written (IC vs Manager vs Director).
2) matched_skills: only include skills/phrases explicitly present in the resume (or directly evidenced by explicit experience).
3) missing_skills: include JD requirements that are not evidenced in the resume.
4) Do NOT heavily penalize match_score for hard requirements like "10+ years" or specific certifications.
   - Those must still appear in missing_skills and recommendations (risk items),
   - but match_score should primarily reflect literal keyword coverage and responsibility overlap.

SCORING MODEL (0-100) — ATS keyword alignment (compute explicitly):
- 70 points: Literal keyword/phrase coverage (exact JD terms appearing anywhere in the resume; Skills/Summary/Experience all count)
- 20 points: Responsibility overlap (duties, domains, systems worked on)
- 10 points: Evidence quality (specificity, projects, measurable outcomes, clarity of sections)

GUIDANCE:
- If most JD keywords are present in the resume (even if framed as exposure/upskilling), match_score can be 80–95.
- Reserve scores below 60 for resumes missing a large portion of JD keywords and responsibilities.

Output must be strict and evidence-based:
- matched_skills: only what’s truly present
- missing_skills: JD items not evidenced (include years/certs here)
- recommendations: concrete, actionable, role-appropriate
`;

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

    const { res: response } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
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
                  description: "Overall match/ATS score from 0-100",
                },
                matched_skills: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Skills found in the resume that match the job or are valuable",
                },
                missing_skills: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Skills not found that would strengthen the candidate",
                },
                key_strengths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key strengths identified in the resume",
                },
                areas_for_improvement: {
                  type: "array",
                  items: { type: "string" },
                  description: "Areas that need improvement",
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific actionable recommendations",
                },
                summary: {
                  type: "string",
                  description: "Brief overall summary of the analysis",
                },
              },
              required: [
                "match_score",
                "matched_skills",
                "missing_skills",
                "recommendations",
                "summary",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analyze_resume" } },
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

    // Sanitize AI output before returning
    analysis.summary = sanitizeString(analysis.summary, 2000);
    
    if (Array.isArray(analysis.matched_skills)) {
      analysis.matched_skills = analysis.matched_skills
        .slice(0, 50)
        .map((s: unknown) => sanitizeString(String(s), 100))
        .filter(Boolean);
    }
    
    if (Array.isArray(analysis.missing_skills)) {
      analysis.missing_skills = analysis.missing_skills
        .slice(0, 50)
        .map((s: unknown) => sanitizeString(String(s), 100))
        .filter(Boolean);
    }
    
    if (Array.isArray(analysis.key_strengths)) {
      analysis.key_strengths = analysis.key_strengths
        .slice(0, 20)
        .map((s: unknown) => sanitizeString(String(s), 500))
        .filter(Boolean);
    }
    
    if (Array.isArray(analysis.areas_for_improvement)) {
      analysis.areas_for_improvement = analysis.areas_for_improvement
        .slice(0, 20)
        .map((s: unknown) => sanitizeString(String(s), 500))
        .filter(Boolean);
    }
    
    if (Array.isArray(analysis.recommendations)) {
      analysis.recommendations = analysis.recommendations
        .slice(0, 20)
        .map((s: unknown) => sanitizeString(String(s), 500))
        .filter(Boolean);
    }

    // Ensure match_score is a valid number between 0-100
    if (typeof analysis.match_score !== 'number' || isNaN(analysis.match_score)) {
      analysis.match_score = 0;
    } else {
      analysis.match_score = Math.min(100, Math.max(0, Math.round(analysis.match_score)));
    }

    // Deterministic sanity score: JD keyword coverage (ATS-style). This prevents "mysterious" constant scores.
    // We combine it with the model's score for a more stable and explainable result.
    let diagnostics: any = null;
    if (jobDescription) {
      const kw = keywordCoverageScore(resumeText, jobDescription);
      const modelScore = analysis.match_score;
      const combined = Math.round(modelScore * 0.4 + kw.score * 0.6);
      analysis.match_score = Math.min(100, Math.max(0, combined));
      diagnostics = {
        scoring: {
          model_score: modelScore,
          keyword_coverage_score: kw.score,
          combined_score: analysis.match_score,
          weights: { model: 0.4, keyword_coverage: 0.6 },
        },
        keyword_coverage: {
          total: kw.total,
          matched_count: kw.matched_count,
          matched: kw.matched.slice(0, 60),
          missing: kw.missing.slice(0, 60),
        },
      };
    }

    return new Response(JSON.stringify({ analysis, diagnostics }), {
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