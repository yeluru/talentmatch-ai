import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation helpers
const MAX_STRING_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 5000;
const MAX_SKILLS = 50;
const MAX_SKILL_LENGTH = 100;
const MAX_PROFILES = 100;

function validateEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = String(email).trim().toLowerCase();
  if (trimmed.length > 255) return null;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(trimmed) ? trimmed : null;
}

function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (trimmed.length > 30) return null;
  // Allow common phone formats
  const phoneRegex = /^[+]?[0-9\s().-]{7,25}$/;
  return phoneRegex.test(trimmed) ? trimmed : null;
}

function validateUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (trimmed.length > 500) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

function pickFirstUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const v = validateUrl(c);
    if (v) return v;
  }
  return null;
}

function sanitizeString(value: string | null | undefined, maxLength: number = MAX_STRING_LENGTH): string | null {
  if (!value) return null;
  // Convert to string, trim, and limit length
  const sanitized = String(value).trim().slice(0, maxLength);
  // Remove potentially dangerous characters for XSS prevention
  return sanitized.replace(/[<>]/g, '');
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

function validateSkills(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .slice(0, MAX_SKILLS)
    .filter((skill): skill is string => typeof skill === 'string')
    .map(skill => sanitizeString(skill, MAX_SKILL_LENGTH))
    .filter((skill): skill is string => skill !== null && skill.length > 0);
}

function normalizeSkillStrings(items: unknown): string[] {
  return validateSkills(items)
    .map((s) => String(s).replace(/^[•\-\*\u2022]+\s*/g, '').trim())
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function uniqLower(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of items) {
    const v = String(s || '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function validateNumber(value: unknown, min: number = 0, max: number = 100): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  return Math.min(Math.max(Math.round(num), min), max);
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create client with user's auth to verify identity
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    const body = await req.json();
    const { profiles, organizationId, source } = body;

    // Validate organizationId format
    if (!organizationId || typeof organizationId !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid organization ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user has access to this organization with recruiter or account_manager role
    const { data: userRoles, error: roleError } = await supabaseAuth
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .in('role', ['recruiter', 'account_manager']);

    if (roleError || !userRoles || userRoles.length === 0) {
      console.error("User doesn't have required access to organization:", organizationId);
      return new Response(JSON.stringify({ error: "Forbidden - no access to this organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User role verified:", userRoles[0].role);

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "No profiles provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit number of profiles per batch
    if (profiles.length > MAX_PROFILES) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_PROFILES} profiles per batch` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Importing", profiles.length, "profiles for org:", organizationId);

    const results = {
      imported: 0,
      skipped: 0,
      relinked: 0,
      errors: [] as string[]
    };

    for (const profile of profiles) {
      try {
        // Validate and sanitize all input fields
        const validatedEmail = validateEmail(profile.email);
        const validatedPhone = validatePhone(profile.phone);
        const validatedLinkedin = validateUrl(profile.linkedin_url);
        const validatedGithub = pickFirstUrl((profile as any).github_url);
        const validatedWebsite = pickFirstUrl((profile as any).website, (profile as any).source_url);
        const validatedName = sanitizeString(profile.full_name, 200) || "Unknown";
        const validatedLocation = sanitizeString(profile.location);
        const validatedTitle = sanitizeString(profile.headline || profile.current_title);
        const validatedCompany = sanitizeString(profile.current_company);
        const validatedSummary = sanitizeString(profile.summary, MAX_SUMMARY_LENGTH);
        const validatedHeadline = sanitizeString(profile.headline || profile.summary, MAX_STRING_LENGTH);
        // Skills can come from:
        // - web_search payloads: profile.skills
        // - parse-resume payloads: profile.technical_skills + profile.soft_skills
        const validatedSkills = uniqLower([
          ...normalizeSkillStrings((profile as any).skills),
          ...normalizeSkillStrings((profile as any).technical_skills),
        ]).slice(0, MAX_SKILLS);
        const validatedSoftSkills = uniqLower([
          ...normalizeSkillStrings((profile as any).soft_skills),
        ]).slice(0, MAX_SKILLS);
        const validatedYearsExp = validateNumber(profile.experience_years || profile.years_of_experience, 0, 70);
        const validatedAtsScore = validateNumber(profile.ats_score, 0, 100);
        
        // Check if candidate already exists by email (if provided)
        if (validatedEmail) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", validatedEmail)
            .maybeSingle();

          if (existingProfile) {
            console.log("Skipping duplicate email:", validatedEmail);
            results.skipped++;
            continue;
          }
        }

        // If resume content hash is provided, enforce duplicate prevention server-side too
        if (profile.resume_file?.content_hash) {
          const incomingHash = String(profile.resume_file.content_hash).slice(0, 128);
          console.log("[bulk-import] incoming resume hash", incomingHash.slice(0, 12), "...", "file:", profile.resume_file.file_name);

          const { data: existingByHash, error: hashLookupError } = await supabase
            .from("resumes")
            .select("id")
            .eq("content_hash", incomingHash)
            .maybeSingle();

          if (hashLookupError) {
            console.error("[bulk-import] hash lookup error:", hashLookupError);
          }

          if (existingByHash) {
            // Do NOT hard-fail: if the resume already exists, re-link the existing candidate to this org
            // so the recruiter can see it again even if it was previously removed from the pool.
            const { data: resumeRow } = await supabase
              .from("resumes")
              .select("candidate_id")
              .eq("content_hash", incomingHash)
              .maybeSingle();

            const existingCandidateId = (resumeRow as any)?.candidate_id as string | undefined;
            if (existingCandidateId) {
              try {
                await supabase.from("candidate_org_links").upsert(
                  {
                    candidate_id: existingCandidateId,
                    organization_id: organizationId,
                    link_type: typeof source === 'string' && source.trim().length ? source.trim().slice(0, 80) : 'resume_upload',
                    status: 'active',
                    created_by: user.id,
                  } as any,
                  { onConflict: "candidate_id,organization_id" },
                );
                results.skipped++;
                results.relinked++;
              } catch (e) {
                results.skipped++;
              }
              continue;
            }

            console.log("[bulk-import] DUPLICATE detected - rejecting import for", validatedName);
            results.skipped++;
            results.errors.push(`DUPLICATE: ${validatedName} - identical resume already exists`);
            continue;
          }
        }

        // De-dupe sourced candidates within this org by LinkedIn URL (preferred) or email.
        // Without this, repeated "Import" clicks create multiple candidate_profiles rows.
        let existingCandidateId: string | null = null;
        if (validatedLinkedin) {
          const { data: existingByLinkedin } = await supabase
            .from("candidate_profiles")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("linkedin_url", validatedLinkedin)
            .maybeSingle();
          if (existingByLinkedin?.id) existingCandidateId = String(existingByLinkedin.id);
        }
        if (!existingCandidateId && validatedEmail) {
          const { data: existingByEmail } = await supabase
            .from("candidate_profiles")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("email", validatedEmail)
            .maybeSingle();
          if (existingByEmail?.id) existingCandidateId = String(existingByEmail.id);
        }
        if (existingCandidateId) {
          try {
            const linkType = typeof source === 'string' && source.trim().length ? source.trim().slice(0, 80) : 'sourced';
            await supabase.from("candidate_org_links").upsert(
              {
                candidate_id: existingCandidateId,
                organization_id: organizationId,
                link_type: linkType,
                status: 'active',
                created_by: user.id,
              } as any,
              { onConflict: "candidate_id,organization_id" },
            );
            results.skipped++;
            results.relinked++;
          } catch {
            results.skipped++;
          }
          continue;
        }

        // Generate a unique ID for the sourced profile
        const candidateId = crypto.randomUUID();

        // Create candidate profile with validated/sanitized data
        const { error: candidateError } = await supabase
          .from("candidate_profiles")
          .insert({
            id: candidateId,
            user_id: null, // Null for sourced/imported profiles (not real users)
            organization_id: organizationId,
            full_name: validatedName,
            email: validatedEmail,
            phone: validatedPhone,
            location: validatedLocation,
            linkedin_url: validatedLinkedin,
            github_url: validatedGithub,
            website: validatedWebsite,
            current_title: validatedTitle,
            current_company: validatedCompany,
            years_of_experience: validatedYearsExp,
            headline: validatedHeadline,
            summary: validatedSummary,
            ats_score: validatedAtsScore,
            is_actively_looking: true,
            profile_completeness: 50
          });

        if (candidateError) {
          console.error("Error creating candidate:", candidateError);
          results.errors.push(`Failed to import ${validatedName}: ${candidateError.message}`);
          continue;
        }

        // IMPORTANT:
        // Recruiter visibility is driven by candidate_org_links (not candidate_profiles.organization_id).
        // If we don't create this link, the recruiter won't see the sourced candidate in Talent Pool due to RLS.
        const linkType = typeof source === 'string' && source.trim().length ? source.trim().slice(0, 80) : 'sourced';
        const { error: linkErr } = await supabase
          .from("candidate_org_links")
          .insert({
            candidate_id: candidateId,
            organization_id: organizationId,
            link_type: linkType,
            status: 'active',
            created_by: user.id,
          });

        if (linkErr) {
          // If the link fails, the candidate will be invisible to recruiters. Clean up and report the error.
          console.error("Error creating candidate-org link:", linkErr);
          try {
            await supabase.from("candidate_profiles").delete().eq("id", candidateId);
          } catch {
            // ignore cleanup errors
          }
          results.errors.push(`Failed to link ${validatedName} to org: ${linkErr.message}`);
          continue;
        }

        // Persist skills (technical + soft) for Talent Pool search/filtering.
        // NOTE: candidate_skills.skill_type exists in newer migrations; default is 'technical'.
        try {
          const skillRows: any[] = [];
          for (const s of validatedSkills) {
            skillRows.push({ candidate_id: candidateId, skill_name: s, skill_type: 'technical' });
          }
          for (const s of validatedSoftSkills) {
            skillRows.push({ candidate_id: candidateId, skill_name: s, skill_type: 'soft' });
          }
          if (skillRows.length > 0) {
            const { error: skillsError } = await supabase.from("candidate_skills").insert(skillRows);
            if (skillsError) console.error("Error adding skills:", skillsError);
          }
        } catch (e) {
          console.warn("Non-fatal: skills insert failed", e);
        }

        // Persist work experience rows (powers company search + company chips in Talent Pool)
        try {
          const expRaw = Array.isArray((profile as any)?.experience) ? (profile as any).experience : [];
          if (expRaw.length > 0) {
            const expInserts = expRaw
              .slice(0, 30)
              .map((e: any) => {
                const company_name = sanitizeString(e?.company, 200);
                const job_title = sanitizeString(e?.title, 200);
                const location = sanitizeString(e?.location, 200);
                const startISO = parseLooseDateToISO(e?.start);
                const endISO = parseLooseDateToISO(e?.end);
                const is_current = !endISO && /present|current/i.test(String(e?.end || "")) ? true : false;
                const bullets = Array.isArray(e?.bullets) ? e.bullets.map((b: any) => sanitizeString(String(b ?? ""), 500) || "").filter(Boolean) : [];
                const description = bullets.length ? bullets.join("\n") : null;

                // candidate_experience requires company_name + job_title. start_date is NOT NULL in schema,
                // but parse output may miss dates; use end_date as a fallback, otherwise a safe sentinel.
                if (!company_name || !job_title) return null;
                const start_date = startISO || endISO || "1900-01-01";

                return {
                  candidate_id: candidateId,
                  company_name,
                  job_title,
                  location,
                  start_date,
                  end_date: endISO,
                  is_current,
                  description,
                };
              })
              .filter(Boolean);

            if (expInserts.length > 0) {
              const { error: expErr } = await supabase.from("candidate_experience").insert(expInserts as any);
              if (expErr) console.error("Error adding experience:", expErr);
            }
          }
        } catch (e) {
          console.warn("Non-fatal: experience insert failed", e);
        }

        // Persist education rows (improves profile completeness + search/filtering)
        try {
          const eduRaw = Array.isArray((profile as any)?.education) ? (profile as any).education : [];
          if (eduRaw.length > 0) {
            const eduInserts = eduRaw
              .slice(0, 20)
              .map((e: any) => {
                const institution = sanitizeString(e?.school ?? e?.institution, 200);
                const degree = sanitizeString(e?.degree, 200);
                const field_of_study = sanitizeString(e?.field ?? e?.field_of_study, 200);
                const start_date = parseLooseDateToISO(e?.start);
                const end_date = parseLooseDateToISO(e?.end);
                if (!institution || !degree) return null; // schema requires both
                return { candidate_id: candidateId, institution, degree, field_of_study, start_date, end_date };
              })
              .filter(Boolean);
            if (eduInserts.length > 0) {
              const { error: eduErr } = await supabase.from("candidate_education").insert(eduInserts as any);
              if (eduErr) console.error("Error adding education:", eduErr);
            }
          }
        } catch (e) {
          console.warn("Non-fatal: education insert failed", e);
        }

        // Create resume record if resume file info is provided
        if (profile.resume_file) {
          const validatedFileName = sanitizeString(profile.resume_file.file_name, 255) || "resume.pdf";
          // IMPORTANT: For storage files we store a bucket-relative reference (e.g. "resumes/<path>" or "<path>"),
          // not necessarily an http(s) URL.
          const validatedFileUrl = sanitizeString(profile.resume_file.file_url, 800);
          const validatedFileType = sanitizeString(profile.resume_file.file_type, 100) || 'application/pdf';
          const validatedHash = profile.resume_file.content_hash 
            ? String(profile.resume_file.content_hash).slice(0, 128) 
            : null;

          if (validatedFileUrl) {
            console.log("[bulk-import] inserting resume with hash", (validatedHash || "(none)").slice(0, 12), "...");

            const { error: resumeError } = await supabase
              .from("resumes")
              .insert({
                candidate_id: candidateId,
                file_name: validatedFileName,
                file_url: validatedFileUrl,
                file_type: validatedFileType,
                ats_score: validatedAtsScore,
                is_primary: true,
                parsed_content: {
                  full_name: validatedName,
                  email: validatedEmail,
                  phone: validatedPhone,
                  skills: validatedSkills,
                  summary: validatedSummary
                },
                content_hash: validatedHash
              });

            if (resumeError) {
              console.error("Error creating resume record:", resumeError);
            } else {
              console.log("Created resume record for:", validatedName);
            }
          }
        }

        results.imported++;
        console.log("Imported:", validatedName);

      } catch (e) {
        console.error("Error importing profile:", e);
        results.errors.push(`Failed to import ${profile.full_name || 'unknown'}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    console.log("Import complete:", results);

    return new Response(JSON.stringify({ 
      success: true, 
      results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("bulk-import-candidates error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});