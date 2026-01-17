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

function sanitizeString(value: string | null | undefined, maxLength: number = MAX_STRING_LENGTH): string | null {
  if (!value) return null;
  // Convert to string, trim, and limit length
  const sanitized = String(value).trim().slice(0, maxLength);
  // Remove potentially dangerous characters for XSS prevention
  return sanitized.replace(/[<>]/g, '');
}

function validateSkills(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .slice(0, MAX_SKILLS)
    .filter((skill): skill is string => typeof skill === 'string')
    .map(skill => sanitizeString(skill, MAX_SKILL_LENGTH))
    .filter((skill): skill is string => skill !== null && skill.length > 0);
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

    // Verify user has access to this organization
    const { data: userRole, error: roleError } = await supabaseAuth
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (roleError || !userRole) {
      console.error("User doesn't have access to organization:", organizationId);
      return new Response(JSON.stringify({ error: "Forbidden - no access to this organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user has recruiter or account_manager role
    if (userRole.role !== 'recruiter' && userRole.role !== 'account_manager') {
      console.error("User doesn't have required role:", userRole.role);
      return new Response(JSON.stringify({ error: "Forbidden - requires recruiter or manager role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User role verified:", userRole.role);

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
      errors: [] as string[]
    };

    for (const profile of profiles) {
      try {
        // Validate and sanitize all input fields
        const validatedEmail = validateEmail(profile.email);
        const validatedPhone = validatePhone(profile.phone);
        const validatedLinkedin = validateUrl(profile.linkedin_url);
        const validatedName = sanitizeString(profile.full_name, 200) || "Unknown";
        const validatedLocation = sanitizeString(profile.location);
        const validatedTitle = sanitizeString(profile.headline || profile.current_title);
        const validatedCompany = sanitizeString(profile.current_company);
        const validatedSummary = sanitizeString(profile.summary, MAX_SUMMARY_LENGTH);
        const validatedHeadline = sanitizeString(profile.headline || profile.summary, MAX_STRING_LENGTH);
        const validatedSkills = validateSkills(profile.skills);
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
            console.log("[bulk-import] DUPLICATE detected - rejecting import for", validatedName);
            results.skipped++;
            results.errors.push(`DUPLICATE: ${validatedName} - identical resume already exists`);
            continue;
          }
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

        // Add validated skills
        if (validatedSkills.length > 0) {
          const skillInserts = validatedSkills.map((skill: string) => ({
            candidate_id: candidateId,
            skill_name: skill
          }));

          const { error: skillsError } = await supabase
            .from("candidate_skills")
            .insert(skillInserts);

          if (skillsError) {
            console.error("Error adding skills:", skillsError);
          }
        }

        // Create resume record if resume file info is provided
        if (profile.resume_file) {
          const validatedFileName = sanitizeString(profile.resume_file.file_name, 255) || "resume.pdf";
          const validatedFileUrl = validateUrl(profile.resume_file.file_url);
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