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

    const { profiles, organizationId, source } = await req.json();

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
      throw new Error("No profiles provided");
    }

    if (!organizationId) {
      throw new Error("Organization ID is required");
    }

    console.log("Importing", profiles.length, "profiles for org:", organizationId);

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const profile of profiles) {
      try {
        
        // Check if candidate already exists by email (if provided)
        if (profile.email) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", profile.email)
            .maybeSingle();

          if (existingProfile) {
            console.log("Skipping duplicate email:", profile.email);
            results.skipped++;
            continue;
          }
        }

        // If resume content hash is provided, enforce duplicate prevention server-side too
        if (profile.resume_file?.content_hash) {
          const incomingHash = String(profile.resume_file.content_hash);
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
            console.log("[bulk-import] DUPLICATE detected - rejecting import for", profile.full_name);
            results.skipped++;
            results.errors.push(`DUPLICATE: ${profile.full_name || profile.resume_file.file_name} - identical resume already exists`);
            continue;
          }
        }

        // Generate a unique ID for the sourced profile
        const candidateId = crypto.randomUUID();

        // Create candidate profile with null user_id (sourced profile, not an actual user)
        const { error: candidateError } = await supabase
          .from("candidate_profiles")
          .insert({
            id: candidateId,
            user_id: null, // Null for sourced/imported profiles (not real users)
            organization_id: organizationId,
            full_name: profile.full_name || "Unknown",
            email: profile.email || null,
            phone: profile.phone || null,
            location: profile.location || null,
            linkedin_url: profile.linkedin_url || null,
            current_title: profile.headline || profile.current_title || null,
            current_company: profile.current_company || null,
            years_of_experience: profile.experience_years || profile.years_of_experience || null,
            headline: profile.headline || profile.summary || null,
            summary: profile.summary || null,
            ats_score: profile.ats_score || null,
            is_actively_looking: true,
            profile_completeness: 50
          });

        if (candidateError) {
          console.error("Error creating candidate:", candidateError);
          results.errors.push(`Failed to import ${profile.full_name || 'unknown'}: ${candidateError.message}`);
          continue;
        }

        // Add skills if provided
        if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) {
          const skillInserts = profile.skills.map((skill: string) => ({
            candidate_id: candidateId,
            skill_name: skill.trim()
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
          const { file_name, file_url, file_type, content_hash } = profile.resume_file;
          console.log("[bulk-import] inserting resume with hash", (content_hash || "(none)").toString().slice(0, 12), "...");

          const { error: resumeError } = await supabase
            .from("resumes")
            .insert({
              candidate_id: candidateId,
              file_name: file_name,
              file_url: file_url,
              file_type: file_type || 'application/pdf',
              ats_score: profile.ats_score || null,
              is_primary: true,
              parsed_content: profile,
              content_hash: content_hash || null
            });

          if (resumeError) {
            console.error("Error creating resume record:", resumeError);
          } else {
            console.log("Created resume record for:", profile.full_name);
          }
        }

        results.imported++;
        console.log("Imported:", profile.full_name);

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
