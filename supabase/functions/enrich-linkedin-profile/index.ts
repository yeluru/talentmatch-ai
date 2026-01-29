import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_HTML_BYTES = 1_500_000; // 1.5MB
const MAX_TEXT_CHARS = 120_000;

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength);
}

function isAllowedLinkedInUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("linkedin.com")) return false;
    return u.pathname.toLowerCase().startsWith("/in/");
  } catch {
    return false;
  }
}

function htmlToVisibleText(html: string) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[ \t\u00A0]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim().slice(0, MAX_TEXT_CHARS);
  return s;
}

function parseLooseDateToISO(s: unknown): string | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("present") || lower.includes("current")) return null;

  // YYYY-MM-DD
  const ymd = raw.match(/\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (ymd) return ymd[0];

  // YYYY-MM or YYYY/MM
  const ym = raw.match(/\b(19|20)\d{2}[-\/](0[1-9]|1[0-2])\b/);
  if (ym) return `${ym[0].replace("/", "-")}-01`;

  // Month YYYY (e.g., Aug 2025)
  const monthMap: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", sept: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12",
  };
  const my = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(19|20)\d{2}\b/i);
  if (my) {
    const mRaw = String(my[1] || "").toLowerCase().replace(".", "");
    const y = my[2];
    const mm = monthMap[mRaw];
    if (mm) return `${y}-${mm}-01`;
  }

  // YYYY
  const y = raw.match(/\b(19|20)\d{2}\b/);
  if (y) return `${y[0]}-01-01`;

  return null;
}

async function fetchLinkedInVisibleText(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  clearTimeout(t);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn fetch failed (${res.status}). ${text ? text.slice(0, 120) : "LinkedIn often blocks automated access."}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const html = await res.text();
    const extractedText = htmlToVisibleText(html);
    return extractedText;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > MAX_HTML_BYTES) break;
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  const extractedText = htmlToVisibleText(html);

  const lower = extractedText.toLowerCase();
  if (
    lower.includes("unusual activity") ||
    (lower.includes("verify") && lower.includes("captcha")) ||
    (lower.includes("sign in") && lower.includes("join now"))
  ) {
    throw new Error("LinkedIn blocked automated access (login/captcha). Please paste LinkedIn text instead.");
  }

  return extractedText;
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client (RLS)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const candidateId = sanitizeString(body?.candidateId, 200);
    const linkedinUrl = sanitizeString(body?.linkedinUrl, 1000);
    const pastedText = sanitizeString(body?.pastedText, MAX_TEXT_CHARS);

    if (!candidateId) {
      return new Response(JSON.stringify({ error: "Missing candidateId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure the requester can see this candidate (derive org from candidate_profiles via RLS)
    const { data: profile, error: profErr } = await supabaseAuth
      .from("candidate_profiles")
      .select("id, organization_id, linkedin_url, full_name, headline, summary, location, current_title, current_company, years_of_experience")
      .eq("id", candidateId)
      .maybeSingle();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Candidate not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.organization_id as string | null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Candidate is missing organization_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user has recruiter or account_manager role for this org
    const { data: roleRow } = await supabaseAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .in("role", ["recruiter", "account_manager"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = (linkedinUrl || (profile.linkedin_url as string | null) || "").trim();
    if (!pastedText && !url) {
      return new Response(JSON.stringify({ error: "Missing linkedinUrl (or candidate has no LinkedIn URL) and no pastedText provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (url && !isAllowedLinkedInUrl(url)) {
      return new Response(JSON.stringify({ error: "Only LinkedIn public profile URLs like https://www.linkedin.com/in/<handle>/ are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceText = pastedText ? pastedText : await fetchLinkedInVisibleText(url);

    const { res: aiRes } = await callChatCompletions({
      messages: [
        {
          role: "system",
          content:
            "You extract structured candidate data from LinkedIn profile text. Be accurate, and leave fields null/empty if not present. Do not hallucinate dates or companies.",
        },
        {
          role: "user",
          content: `CandidateId: ${candidateId}\nLinkedIn URL: ${url || "(pasted text)"}\n\nLinkedIn text (truncated):\n${sourceText.slice(0, 15000)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_candidate",
            description: "Extract candidate profile fields, skills, experience, and education from LinkedIn text",
            parameters: {
              type: "object",
              properties: {
                full_name: { type: "string" },
                headline: { type: "string" },
                location: { type: "string" },
                current_title: { type: "string" },
                current_company: { type: "string" },
                summary: { type: "string" },
                years_of_experience: { type: "number" },
                skills: { type: "array", items: { type: "string" } },
                experience: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      company_name: { type: "string" },
                      job_title: { type: "string" },
                      location: { type: "string" },
                      start_date: { type: "string", description: "Best-effort date string as seen (e.g., 'Aug 2021' or '2021-08')" },
                      end_date: { type: "string", description: "Best-effort date string as seen or 'Present'" },
                      is_current: { type: "boolean" },
                      description: { type: "string" },
                    },
                    required: ["company_name", "job_title"],
                    additionalProperties: false,
                  },
                },
                education: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      institution: { type: "string" },
                      degree: { type: "string" },
                      field_of_study: { type: "string" },
                      start_date: { type: "string" },
                      end_date: { type: "string" },
                    },
                    required: ["institution", "degree"],
                    additionalProperties: false,
                  },
                },
              },
              required: [],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_candidate" } },
    });

    if (!aiRes.ok) {
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const extracted = JSON.parse(toolCall.function.arguments || "{}") as any;

    // Service client (writes)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nextProfile: Record<string, any> = {};
    const maybeSet = (key: string, v: unknown) => {
      const s = typeof v === "string" ? v.trim() : v;
      if (typeof s === "string" && !s) return;
      if (s === null || s === undefined) return;
      nextProfile[key] = s;
    };

    // Prefer not to overwrite non-empty existing fields with shorter/empty values
    const setIfBetter = (key: string, v: unknown, existing: unknown) => {
      const s = typeof v === "string" ? v.trim() : v;
      if (s === null || s === undefined) return;
      if (typeof s === "string" && !s) return;
      const e = typeof existing === "string" ? existing.trim() : existing;
      if (!e) return maybeSet(key, s);
      if (typeof s === "string" && typeof e === "string") {
        if (s.length > e.length) return maybeSet(key, s);
        return;
      }
      // numbers: overwrite only if existing is null
      if (typeof s === "number" && (e === null || e === undefined)) return maybeSet(key, s);
    };

    setIfBetter("full_name", extracted.full_name, profile.full_name);
    setIfBetter("headline", extracted.headline, profile.headline);
    setIfBetter("summary", extracted.summary, profile.summary);
    setIfBetter("location", extracted.location, profile.location);
    setIfBetter("current_title", extracted.current_title, profile.current_title);
    setIfBetter("current_company", extracted.current_company, profile.current_company);
    setIfBetter("years_of_experience", extracted.years_of_experience, profile.years_of_experience);
    if (url) maybeSet("linkedin_url", url);
    if (Object.keys(nextProfile).length > 0) {
      await supabase.from("candidate_profiles").update(nextProfile).eq("id", candidateId);
    }

    // Existing skills for dedupe
    const { data: existingSkills } = await supabase
      .from("candidate_skills")
      .select("skill_name")
      .eq("candidate_id", candidateId);
    const skillSeen = new Set((existingSkills || []).map((r: any) => String(r.skill_name || "").trim().toLowerCase()).filter(Boolean));
    const rawSkills = Array.isArray(extracted.skills) ? extracted.skills : [];
    const toInsertSkills: any[] = [];
    for (const s of rawSkills.slice(0, 60)) {
      const v = String(s || "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (skillSeen.has(k)) continue;
      skillSeen.add(k);
      toInsertSkills.push({ id: crypto.randomUUID(), candidate_id: candidateId, skill_name: v });
    }
    if (toInsertSkills.length) {
      await supabase.from("candidate_skills").insert(toInsertSkills);
    }

    // Existing experience for dedupe
    const { data: existingExp } = await supabase
      .from("candidate_experience")
      .select("company_name, job_title, start_date")
      .eq("candidate_id", candidateId);
    const expSeen = new Set(
      (existingExp || []).map((r: any) => `${String(r.company_name || "").toLowerCase()}|${String(r.job_title || "").toLowerCase()}|${String(r.start_date || "")}`)
    );

    const expRaw = Array.isArray(extracted.experience) ? extracted.experience : [];
    const toInsertExp: any[] = [];
    for (const e of expRaw.slice(0, 40)) {
      const company_name = String(e?.company_name || "").trim();
      const job_title = String(e?.job_title || "").trim();
      if (!company_name || !job_title) continue;
      const startISO = parseLooseDateToISO(e?.start_date);
      if (!startISO) continue; // schema requires start_date
      const endISO = parseLooseDateToISO(e?.end_date);
      const is_current = Boolean(e?.is_current) || (!endISO && /present|current/i.test(String(e?.end_date || "")));
      const key = `${company_name.toLowerCase()}|${job_title.toLowerCase()}|${startISO}`;
      if (expSeen.has(key)) continue;
      expSeen.add(key);
      toInsertExp.push({
        id: crypto.randomUUID(),
        candidate_id: candidateId,
        company_name,
        job_title,
        location: sanitizeString(e?.location, 200),
        start_date: startISO,
        end_date: endISO,
        is_current,
        description: sanitizeString(e?.description, 4000),
      });
    }
    if (toInsertExp.length) {
      await supabase.from("candidate_experience").insert(toInsertExp);
    }

    // Existing education for dedupe
    const { data: existingEdu } = await supabase
      .from("candidate_education")
      .select("institution, degree, field_of_study, end_date")
      .eq("candidate_id", candidateId);
    const eduSeen = new Set(
      (existingEdu || []).map((r: any) =>
        `${String(r.institution || "").toLowerCase()}|${String(r.degree || "").toLowerCase()}|${String(r.field_of_study || "").toLowerCase()}|${String(r.end_date || "")}`
      )
    );

    const eduRaw = Array.isArray(extracted.education) ? extracted.education : [];
    const toInsertEdu: any[] = [];
    for (const ed of eduRaw.slice(0, 20)) {
      const institution = String(ed?.institution || "").trim();
      const degree = String(ed?.degree || "").trim();
      if (!institution || !degree) continue;
      const field_of_study = sanitizeString(ed?.field_of_study, 200);
      const start_date = parseLooseDateToISO(ed?.start_date);
      const end_date = parseLooseDateToISO(ed?.end_date);
      const key = `${institution.toLowerCase()}|${degree.toLowerCase()}|${String(field_of_study || "").toLowerCase()}|${String(end_date || "")}`;
      if (eduSeen.has(key)) continue;
      eduSeen.add(key);
      toInsertEdu.push({
        id: crypto.randomUUID(),
        candidate_id: candidateId,
        institution,
        degree,
        field_of_study,
        start_date,
        end_date,
      });
    }
    if (toInsertEdu.length) {
      await supabase.from("candidate_education").insert(toInsertEdu);
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated: {
          profile_fields_updated: Object.keys(nextProfile),
          skills_added: toInsertSkills.length,
          experience_added: toInsertExp.length,
          education_added: toInsertEdu.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const msg =
      e?.name === "AbortError"
        ? "LinkedIn fetch timed out. Please paste LinkedIn text instead."
        : (e?.message || "Unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

